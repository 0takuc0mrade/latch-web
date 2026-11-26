import { describe, expect, test } from "bun:test";
import { Keypair } from "@stellar/stellar-sdk";
import { ChainReadError, ChainRejectedError, RuleMissingError, type PreparedTx } from "../lib/demo/server/chain";
import { DemoConfigError, readDemoServerConfig, resolveRelyingParty, type DemoServerConfig } from "../lib/demo/server/config";
import { createDemoHandlers, type DemoHandlerDeps } from "../lib/demo/server/handlers";
import type { DemoPasskeyRecord } from "../lib/demo/server/store";
import { signToken, TokenError, verifyToken } from "../lib/demo/server/token";

const SECRET = Keypair.random().secret();
const ACCOUNT = "CDK44EDWIUM6JTSAHPAMBFNMICGQLTBGUD3LAP7NF47Q6VBVUSPSCJIL";
const RECIPIENT = "GBRTN33C4X3QJOJX7C3GOCHY4GMXWYLGMGIF74QA57QAO6UYQUBIT6FM";
const KEY_DATA_HEX = "04" + "11".repeat(64) + "010203040506";
const ORIGIN = "https://demo.uselatch.app";
const config: DemoServerConfig = { ...readDemoServerConfig({ DEMO_BUNDLER_SECRET: SECRET }), rpId: "demo.uselatch.app", origin: ORIGIN };
const PREPARED: PreparedTx = { hostFunctionXdr: "AA", authEntriesXdr: ["AA"], smartAccountIndex: 0, contextRuleIds: [1], authDigestHex: "ab".repeat(32) };

function request(path: string, body?: unknown, headers: Record<string, string> = { origin: ORIGIN }) {
  return new Request(`${ORIGIN}/api/demo${path}`, body === undefined ? { headers } : { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
}

function deps(overrides: { chain?: Partial<DemoHandlerDeps["chain"]>; passkeys?: Partial<DemoHandlerDeps["passkeys"]>; store?: Partial<DemoHandlerDeps["store"]> } = {}) {
  const saved: DemoPasskeyRecord[] = [];
  const calls: string[] = [];
  const unexpected = (name: string) => async () => {
    throw new Error(`unexpected ${name}`);
  };
  const value: DemoHandlerDeps = {
    config: () => config,
    log: () => {},
    store: {
      save: async (record) => void saved.push(record),
      find: async () => null,
      updateSignCount: async () => {},
      ...overrides.store,
    },
    chain: {
      predictAccountAddress: async () => ACCOUNT,
      deployAccount: async () => {
        calls.push("deploy");
        return ACCOUNT;
      },
      isDeployed: async () => true,
      readAccountState: unexpected("readAccountState"),
      readBalance: unexpected("readBalance"),
      prepareSend: unexpected("prepareSend"),
      prepareInstallLimit: unexpected("prepareInstallLimit"),
      submitSigned: unexpected("submitSigned"),
      ...overrides.chain,
    } as DemoHandlerDeps["chain"],
    passkeys: {
      registrationOptions: unexpected("registrationOptions"),
      verifyRegistration: unexpected("verifyRegistration"),
      authenticationOptions: unexpected("authenticationOptions"),
      verifyAuthentication: unexpected("verifyAuthentication"),
      ...overrides.passkeys,
    } as DemoHandlerDeps["passkeys"],
  };
  return { handlers: createDemoHandlers(value), saved, calls };
}

describe("demo server config", () => {
  test("requires the bundler secret; defaults to the playground's testnet contracts", () => {
    expect(() => readDemoServerConfig({})).toThrow(DemoConfigError);
    const c = readDemoServerConfig({ DEMO_BUNDLER_SECRET: SECRET });
    expect(c.factoryAddress).toBe("CABA6ERCFZRZXZV5EYQCFB5AQMHMAIEOB5TCN7JWHMK3HWUZJCJNUZRR");
    expect(c.webauthnVerifierAddress).toBe("CDBBGLSWWHWK52REY7GK5HWAQGAJJ4GP5O75LOM3F4INN6W4KT6DPBVY");
    expect(c.networkPassphrase).toBe("Test SDF Network ; September 2015");
  });

  test("RP from explicit settings, else from the request host; never the wallet's uselatch.app", () => {
    expect(resolveRelyingParty(new Request("https://x.vercel.app/api"), {})).toEqual({ rpId: "x.vercel.app", origin: "https://x.vercel.app" });
    expect(resolveRelyingParty(new Request("http://localhost:3000/api"), {})).toEqual({ rpId: "localhost", origin: "http://localhost:3000" });
    expect(resolveRelyingParty(new Request("https://a/api", { headers: { "x-forwarded-host": "demo.uselatch.app", "x-forwarded-proto": "https" } }), {})).toEqual({
      rpId: "demo.uselatch.app",
      origin: "https://demo.uselatch.app",
    });
    expect(resolveRelyingParty(new Request("https://x/api"), { rpId: "demo.uselatch.app", origin: ORIGIN })).toEqual({ rpId: "demo.uselatch.app", origin: ORIGIN });
    expect(() => resolveRelyingParty(new Request("https://uselatch.app/api"), {})).toThrow(DemoConfigError);
  });
});

describe("demo tokens", () => {
  test("round-trip; tampering, wrong purpose and expiry are rejected", () => {
    const token = signToken({ purpose: "tx", n: 1 }, SECRET, 1000, 0);
    expect(verifyToken<{ n: number }>(token, SECRET, "tx", 500).n).toBe(1);
    expect(() => verifyToken(token, SECRET, "register", 500)).toThrow(TokenError);
    expect(() => verifyToken(token, SECRET, "tx", 2000)).toThrow(TokenError);
    expect(() => verifyToken(token, Keypair.random().secret(), "tx", 500)).toThrow(TokenError);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ purpose: "tx", n: 2, exp: 9e15 })).toString("base64url");
    expect(() => verifyToken(`${forged}.${mac}`, SECRET, "tx", 500)).toThrow(TokenError);
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("demo API handlers", () => {
  test("cross-origin writes are refused", async () => {
    const { handlers } = deps();
    const response = await handlers.prepare(request("/prepare", { action: "install-limit", address: ACCOUNT, keyDataHex: KEY_DATA_HEX }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
  });

  test("register/verify records the passkey before deploying, then returns the account", async () => {
    const { handlers, saved, calls } = deps({
      passkeys: { verifyRegistration: async () => ({ credentialId: "cred", keyDataHex: KEY_DATA_HEX, cosePublicKey: new Uint8Array([1]), signCount: 0, rpId: "demo.uselatch.app" }) },
    });
    const response = await handlers.registerVerify(request("/passkey/register/verify", { token: "t", response: {} }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ address: ACCOUNT, credentialId: "cred", keyDataHex: KEY_DATA_HEX });
    expect(saved[0].accountAddress).toBe(ACCOUNT);
    expect(calls).toEqual(["deploy"]);
  });

  test("register/verify: a failed deploy is 502 account_deploy_failed", async () => {
    const { handlers } = deps({
      passkeys: { verifyRegistration: async () => ({ credentialId: "c", keyDataHex: KEY_DATA_HEX, cosePublicKey: new Uint8Array([1]), signCount: 0, rpId: "r" }) },
      chain: {
        deployAccount: async () => {
          throw new Error("boom");
        },
      },
    });
    const response = await handlers.registerVerify(request("/passkey/register/verify", { token: "t", response: {} }));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("account_deploy_failed");
  });

  test("signin/verify: unknown passkey 404; known passkey returns its account", async () => {
    const unknown = deps();
    expect((await unknown.handlers.signinVerify(request("/passkey/signin/verify", { token: "t", response: { id: "nope" } }))).status).toBe(404);

    const stored: DemoPasskeyRecord = { credentialId: "cred", cosePublicKey: new Uint8Array([1]), keyDataHex: KEY_DATA_HEX, accountAddress: ACCOUNT, rpId: "r", signCount: 3 };
    let updated = -1;
    const known = deps({
      store: { find: async () => stored, updateSignCount: async (_id, n) => void (updated = n) },
      passkeys: { verifyAuthentication: async () => 4 },
    });
    const response = await known.handlers.signinVerify(request("/passkey/signin/verify", { token: "t", response: { id: "cred" } }));
    expect(await response.json()).toEqual({ address: ACCOUNT, credentialId: "cred", keyDataHex: KEY_DATA_HEX });
    expect(updated).toBe(4);
  });

  test("account: read failures are 503 network_unavailable (never 'no rule')", async () => {
    const { handlers } = deps({
      chain: {
        readAccountState: async () => {
          throw new ChainReadError("rpc down");
        },
      },
    });
    const response = await handlers.account(request(`/account?address=${ACCOUNT}&keyDataHex=${KEY_DATA_HEX}`));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("network_unavailable");
  });

  test("account: bigints are sent as strings", async () => {
    const { handlers } = deps({
      chain: { readAccountState: async () => ({ deployed: true, balanceStroops: BigInt(5), rule: { id: 1, limitStroops: BigInt(10), periodLedgers: 2 }, usedStroops: BigInt(1) }) },
    });
    const body = await (await handlers.account(request(`/account?address=${ACCOUNT}`))).json();
    expect(body).toEqual({ deployed: true, balanceStroops: "5", rule: { id: 1, limitStroops: "10", periodLedgers: 2 }, usedStroops: "1" });
  });

  test("prepare send validates input and passes exact stroops", async () => {
    let amount: bigint | null = null;
    const { handlers } = deps({
      chain: {
        prepareSend: async (_c, _a, _k, _to, stroops) => {
          amount = stroops;
          return PREPARED;
        },
      },
    });
    const ok = await handlers.prepare(request("/prepare", { action: "send", address: ACCOUNT, keyDataHex: KEY_DATA_HEX, to: RECIPIENT, amountStroops: "1" }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.authDigestHex).toBe(PREPARED.authDigestHex);
    expect(verifyToken<{ prepared: PreparedTx }>(body.token, SECRET, "tx").prepared).toEqual(PREPARED);
    expect(amount!).toBe(BigInt(1));

    for (const bad of [
      { to: "GNOPE", amountStroops: "1" },
      { to: RECIPIENT, amountStroops: "0" },
      { to: RECIPIENT, amountStroops: "1e-7" },
      { to: ACCOUNT, amountStroops: "1" },
    ]) {
      const response = await handlers.prepare(request("/prepare", { action: "send", address: ACCOUNT, keyDataHex: KEY_DATA_HEX, ...bad }));
      expect(response.status).toBe(400);
    }
  });

  test("prepare: rule missing 409; already installed → { installed: true }", async () => {
    const missing = deps({
      chain: {
        prepareSend: async () => {
          throw new RuleMissingError("x");
        },
      },
    });
    expect((await missing.handlers.prepare(request("/prepare", { action: "send", address: ACCOUNT, keyDataHex: KEY_DATA_HEX, to: RECIPIENT, amountStroops: "5" }))).status).toBe(409);

    const installed = deps({ chain: { prepareInstallLimit: async () => null } });
    const response = await installed.handlers.prepare(request("/prepare", { action: "install-limit", address: ACCOUNT, keyDataHex: KEY_DATA_HEX }));
    expect(await response.json()).toEqual({ installed: true });
  });

  test("submit: over the limit is 422 spending_limit_exceeded; forged tokens are refused", async () => {
    const assertion = { authenticatorData: "AQ", clientDataJSON: "Ag", signature: "MAYCAQECAQE" }; // DER (r=1, s=1)
    const over = deps({
      chain: {
        submitSigned: async () => {
          throw new ChainRejectedError("Error(Auth, InvalidAction)", 3221);
        },
      },
    });
    const token = signToken({ purpose: "tx", keyDataHex: KEY_DATA_HEX, prepared: PREPARED }, SECRET, 60_000);
    const response = await over.handlers.submit(request("/submit", { token, assertion }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "spending_limit_exceeded", contractErrorCode: 3221 });

    const forged = signToken({ purpose: "tx", keyDataHex: KEY_DATA_HEX, prepared: PREPARED }, Keypair.random().secret(), 60_000);
    const refused = await over.handlers.submit(request("/submit", { token: forged, assertion }));
    expect(refused.status).toBe(400);
    expect((await refused.json()).code).toBe("expired");
  });

  test("submit: success returns hash and status", async () => {
    let sigLength = 0;
    const { handlers } = deps({
      chain: {
        submitSigned: async (_c, prepared, key, sigData) => {
          expect(prepared).toEqual(PREPARED);
          expect(key).toBe(KEY_DATA_HEX);
          sigLength = sigData.length;
          return { hash: "h", status: "success" as const };
        },
      },
    });
    const token = signToken({ purpose: "tx", keyDataHex: KEY_DATA_HEX, prepared: PREPARED }, SECRET, 60_000);
    const response = await handlers.submit(request("/submit", { token, assertion: { authenticatorData: "AQ", clientDataJSON: "Ag", signature: "MAYCAQECAQE" } }));
    expect(await response.json()).toEqual({ hash: "h", status: "success" });
    expect(sigLength).toBeGreaterThan(64);
  });

  test("the demo refuses to run on uselatch.app (the wallet's passkey domain)", async () => {
    const apex = createDemoHandlers({ ...({} as DemoHandlerDeps), config: () => ({ ...config, rpId: undefined, origin: undefined }), log: () => {} } as DemoHandlerDeps);
    const response = await apex.registerOptions(new Request("https://uselatch.app/api/demo/passkey/register/options", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("wrong_host");
  });
});
