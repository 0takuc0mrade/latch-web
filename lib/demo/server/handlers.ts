/**
 * Request handlers for app/api/demo/*. Dependencies are injected so tests can
 * run without a database or the network; the route files wire in the real ones.
 *
 * Every response is JSON. Errors carry a `code` the browser maps to its copy:
 * network_unavailable (503, a read failed: unknown, not "empty"),
 * spending_limit_exceeded (422, the rule said no; nothing was submitted),
 * rejected (422), rule_missing (409), expired (400), wrong_host (400),
 * not_found (404), forbidden (403), bad_request (400), failed (500/502).
 */
import { StrKey } from "@stellar/stellar-sdk";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { ERROR_SPENDING_LIMIT_EXCEEDED } from "../constants";
import { b64uDecode, derToCompactLowS, encodeWebAuthnSigData } from "../webauthn-codec";
import type * as chainModule from "./chain";
import { ChainReadError, ChainRejectedError, RuleMissingError } from "./chain";
import { DemoConfigError, readDemoServerConfig, resolveRelyingParty, WALLET_RP_ID, type DemoServerConfig } from "./config";
import type * as passkeysModule from "./passkeys";
import type { DemoPasskeyStore } from "./store";
import { signToken, TokenError, verifyToken } from "./token";

export interface DemoHandlerDeps {
  config: () => DemoServerConfig;
  store: DemoPasskeyStore;
  chain: Pick<typeof chainModule, "predictAccountAddress" | "deployAccount" | "isDeployed" | "readAccountState" | "readBalance" | "prepareSend" | "prepareInstallLimit" | "submitSigned">;
  passkeys: Pick<typeof passkeysModule, "registrationOptions" | "verifyRegistration" | "authenticationOptions" | "verifyAuthentication">;
  log?: (message: string, error: unknown) => void;
}

const MAX_BODY_BYTES = 16 * 1024;
const PREPARED_TTL_MS = 4 * 60 * 1000;
const KEY_DATA_HEX = /^04[0-9a-f]{128}[0-9a-f]{2,1024}$/i;
const MAX_AMOUNT_STROOPS = BigInt("1000000000000000");

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value)), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "bad_request", "Request too large");
  try {
    const value = JSON.parse(text || "{}");
    if (typeof value !== "object" || value === null) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "bad_request", "Invalid JSON");
  }
}

/** Only the demo page itself may call the write routes (they spend the bundler's XLM). */
function assertSameOrigin(request: Request, expectedOrigin: string) {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== expectedOrigin) throw new HttpError(403, "forbidden", "Cross-origin request");
}

function contractAddress(value: unknown): string {
  if (typeof value !== "string" || !StrKey.isValidContract(value)) throw new HttpError(400, "bad_request", "Invalid account address");
  return value;
}

function anyAddress(value: unknown): string {
  if (typeof value !== "string" || !(StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value))) {
    throw new HttpError(400, "bad_request", "Invalid Stellar address");
  }
  return value;
}

function keyDataHex(value: unknown): string {
  if (typeof value !== "string" || !KEY_DATA_HEX.test(value)) throw new HttpError(400, "bad_request", "Invalid key data");
  return value.toLowerCase();
}

function amount(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d{1,16}$/.test(value)) throw new HttpError(400, "bad_request", "Invalid amount");
  const stroops = BigInt(value);
  if (stroops <= BigInt(0) || stroops > MAX_AMOUNT_STROOPS) throw new HttpError(400, "bad_request", "Invalid amount");
  return stroops;
}

function b64u(value: unknown, name: string): Uint8Array {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,4096}$/.test(value)) throw new HttpError(400, "bad_request", `Invalid ${name}`);
  return b64uDecode(value);
}

export function createDemoHandlers(deps: DemoHandlerDeps) {
  const log = deps.log ?? ((message, error) => console.error(`[demo] ${message}`, error));

  /** Runs a handler and turns every known failure into its JSON error. */
  function handle(name: string, fn: (request: Request, config: DemoServerConfig) => Promise<Response>) {
    return async (request: Request): Promise<Response> => {
      try {
        return await fn(request, deps.config());
      } catch (error) {
        if (error instanceof HttpError) return json(error.status, { code: error.code, message: error.message, ...error.extra });
        if (error instanceof DemoConfigError) {
          const wrongHost = error.message.includes(WALLET_RP_ID);
          if (!wrongHost) log(`${name}: not configured`, error);
          return json(wrongHost ? 400 : 503, { code: wrongHost ? "wrong_host" : "not_configured", message: error.message });
        }
        if (error instanceof TokenError) return json(400, { code: "expired", message: "This request expired. Try again." });
        if (error instanceof RuleMissingError) return json(409, { code: "rule_missing", message: error.message });
        if (error instanceof ChainRejectedError) {
          const code = error.contractErrorCode === ERROR_SPENDING_LIMIT_EXCEEDED ? "spending_limit_exceeded" : "rejected";
          return json(422, { code, contractErrorCode: error.contractErrorCode, message: error.message.slice(0, 500) });
        }
        if (error instanceof ChainReadError) return json(503, { code: "network_unavailable", message: "Stellar testnet couldn't be reached." });
        log(`${name} failed`, error);
        return json(500, { code: "failed", message: "Something went wrong." });
      }
    };
  }

  return {
    registerOptions: handle("register/options", async (request, config) => {
      const rp = resolveRelyingParty(request, config);
      assertSameOrigin(request, rp.origin);
      const body = await readJson(request);
      const displayName = typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim().slice(0, 64) : "Latch demo";
      return json(200, await deps.passkeys.registrationOptions(rp, displayName, config.bundlerSecret));
    }),

    /** Verify the new passkey, record it, then deploy its smart account (bundler pays). */
    registerVerify: handle("register/verify", async (request, config) => {
      assertSameOrigin(request, resolveRelyingParty(request, config).origin);
      const body = await readJson(request);
      let passkey;
      try {
        passkey = await deps.passkeys.verifyRegistration(body.token, body.response as RegistrationResponseJSON, config.bundlerSecret);
      } catch (error) {
        if (error instanceof TokenError) throw error;
        throw new HttpError(400, "bad_request", "The passkey couldn't be verified.");
      }
      const address = await deps.chain.predictAccountAddress(config, passkey.keyDataHex);
      // Recorded before deploying: if deploying fails, signing in later still finds (and redeploys) it.
      await deps.store.save({ ...passkey, accountAddress: address });
      try {
        await deps.chain.deployAccount(config, passkey.keyDataHex);
      } catch (error) {
        log("account deploy failed", error);
        throw new HttpError(502, "account_deploy_failed", "The account couldn't be created on Stellar testnet.");
      }
      return json(200, { address, credentialId: passkey.credentialId, keyDataHex: passkey.keyDataHex });
    }),

    signinOptions: handle("signin/options", async (request, config) => {
      const rp = resolveRelyingParty(request, config);
      assertSameOrigin(request, rp.origin);
      return json(200, await deps.passkeys.authenticationOptions(rp, config.bundlerSecret));
    }),

    signinVerify: handle("signin/verify", async (request, config) => {
      assertSameOrigin(request, resolveRelyingParty(request, config).origin);
      const body = await readJson(request);
      const response = body.response as AuthenticationResponseJSON | undefined;
      if (!response || typeof response.id !== "string") throw new HttpError(400, "bad_request", "Missing passkey response");
      const stored = await deps.store.find(response.id);
      if (!stored) throw new HttpError(404, "not_found", "No demo account for this passkey.");
      let counter: number;
      try {
        counter = await deps.passkeys.verifyAuthentication(body.token, response, stored, config.bundlerSecret);
      } catch (error) {
        if (error instanceof TokenError) throw error;
        throw new HttpError(400, "bad_request", "The passkey couldn't be verified.");
      }
      await deps.store.updateSignCount(stored.credentialId, counter);
      if (!(await deps.chain.isDeployed(config, stored.accountAddress))) {
        // Recorded but never deployed (deploy failed at create): finish it now.
        await deps.chain.deployAccount(config, stored.keyDataHex);
      }
      return json(200, { address: stored.accountAddress, credentialId: stored.credentialId, keyDataHex: stored.keyDataHex });
    }),

    /** GET ?address=C…&keyDataHex=…: deployed, balance, spending limit and usage. */
    account: handle("account", async (request, config) => {
      const params = new URL(request.url).searchParams;
      const address = contractAddress(params.get("address"));
      const key = params.get("keyDataHex") ? keyDataHex(params.get("keyDataHex")) : null;
      const state = await deps.chain.readAccountState(config, address, key);
      return json(200, state);
    }),

    /** GET ?address=G…|C…: native XLM balance. */
    balance: handle("balance", async (request, config) => {
      const address = anyAddress(new URL(request.url).searchParams.get("address"));
      return json(200, { balanceStroops: await deps.chain.readBalance(config, address) });
    }),

    /**
     * POST { action: "send", address, keyDataHex, to, amountStroops } or
     * { action: "install-limit", address, keyDataHex }: builds the
     * transaction and returns the digest the passkey signs, plus a token
     * that only /submit accepts. install-limit answers { installed: true }
     * when the limit is already there.
     */
    prepare: handle("prepare", async (request, config) => {
      assertSameOrigin(request, resolveRelyingParty(request, config).origin);
      const body = await readJson(request);
      const address = contractAddress(body.address);
      const key = keyDataHex(body.keyDataHex);
      let prepared;
      if (body.action === "send") {
        const to = anyAddress(body.to);
        if (to === address) throw new HttpError(400, "bad_request", "Choose a different recipient");
        prepared = await deps.chain.prepareSend(config, address, key, to, amount(body.amountStroops));
      } else if (body.action === "install-limit") {
        prepared = await deps.chain.prepareInstallLimit(config, address, key);
        if (!prepared) return json(200, { installed: true });
      } else {
        throw new HttpError(400, "bad_request", "Unknown action");
      }
      const token = signToken({ purpose: "tx", action: body.action, address, keyDataHex: key, prepared }, config.bundlerSecret, PREPARED_TTL_MS);
      return json(200, { token, authDigestHex: prepared.authDigestHex });
    }),

    /**
     * POST { token, assertion: { authenticatorData, clientDataJSON, signature } } (base64url):
     * attaches the passkey signature, checks it against the account's rules,
     * and submits with the bundler paying. Over the limit: 422
     * spending_limit_exceeded, and nothing is submitted.
     */
    submit: handle("submit", async (request, config) => {
      assertSameOrigin(request, resolveRelyingParty(request, config).origin);
      const body = await readJson(request);
      const token = verifyToken<{ purpose: "tx"; keyDataHex: string; prepared: chainModule.PreparedTx }>(body.token, config.bundlerSecret, "tx");
      const assertion = (body.assertion ?? {}) as Record<string, unknown>;
      let sigData: Uint8Array;
      try {
        sigData = encodeWebAuthnSigData({
          authenticatorData: b64u(assertion.authenticatorData, "authenticatorData"),
          clientDataJSON: b64u(assertion.clientDataJSON, "clientDataJSON"),
          signature: derToCompactLowS(b64u(assertion.signature, "signature")),
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, "bad_request", "Invalid passkey signature");
      }
      const result = await deps.chain.submitSigned(config, token.prepared, token.keyDataHex, sigData);
      return json(200, result);
    }),
  };
}

export type DemoHandlers = ReturnType<typeof createDemoHandlers>;

export { readDemoServerConfig };
