import { describe, expect, test } from "bun:test";
import { createSign, generateKeyPairSync } from "node:crypto";
import { DemoError, type SendStep } from "../lib/demo/adapter";
import { xlmToStroops } from "../lib/demo/constants";
import { LIVE_ACCOUNT_KEY, LiveDemoAdapter, type LiveConfig } from "../lib/demo/live-adapter";
import { b64uEncode, contractInstanceLedgerKey, derToCompactLowS, encodeWebAuthnSigData, hexEncode } from "../lib/demo/webauthn-codec";

const ADDRESS = "CDK44EDWIUM6JTSAHPAMBFNMICGQLTBGUD3LAP7NF47Q6VBVUSPSCJIL";
const CREDENTIAL_ID = b64uEncode(new Uint8Array([1, 2, 3, 4, 5, 6]));
const KEY_DATA_HEX = "04" + "11".repeat(64) + "010203040506";
const DIGEST_HEX = "ab".repeat(32);

const config: LiveConfig = {
  apiUrl: "https://api.example",
  fundUrl: "https://fund.example",
  rpcUrl: "https://rpc.example",
  rpId: "uselatch.app",
  explorerTxUrl: "https://stellar.expert/explorer/testnet/tx",
};

interface Call {
  url: string;
  method: string;
  credentials?: RequestCredentials;
  body: Record<string, unknown> | null;
}

type Route = (call: Call) => { status?: number; body: unknown } | undefined;

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const derSignature = new Uint8Array(createSign("SHA256").update("x").sign(privateKey));
const buf = (bytes: number[] | Uint8Array) => new Uint8Array(bytes).buffer;

function harness(routes: Route, opts: { hostname?: string; credentials?: "ok" | "cancel"; stored?: boolean; balanceRaw?: string } = {}) {
  const calls: Call[] = [];
  const passkeyCalls: { kind: string; options: CredentialCreationOptions | CredentialRequestOptions }[] = [];
  const storage = new Map<string, string>();
  if (opts.stored) storage.set(LIVE_ACCOUNT_KEY, JSON.stringify({ address: ADDRESS, credentialId: CREDENTIAL_ID, keyDataHex: KEY_DATA_HEX }));

  const assertion = {
    id: CREDENTIAL_ID,
    rawId: buf([1, 2, 3, 4, 5, 6]),
    type: "public-key",
    response: { clientDataJSON: buf([123, 125]), authenticatorData: buf([9, 9, 9]), signature: derSignature.buffer },
  };
  const attestation = {
    id: CREDENTIAL_ID,
    rawId: buf([1, 2, 3, 4, 5, 6]),
    type: "public-key",
    response: { clientDataJSON: buf([123, 125]), attestationObject: buf([7, 7]), getTransports: () => ["internal"] },
  };
  const credentials = {
    create: async (options: CredentialCreationOptions) => {
      passkeyCalls.push({ kind: "create", options });
      if (opts.credentials === "cancel") throw Object.assign(new Error("closed"), { name: "NotAllowedError" });
      return attestation as unknown as Credential;
    },
    get: async (options: CredentialRequestOptions) => {
      passkeyCalls.push({ kind: "get", options });
      if (opts.credentials === "cancel") throw Object.assign(new Error("closed"), { name: "NotAllowedError" });
      return assertion as unknown as Credential;
    },
  };

  const fetchImpl = async (url: string, init?: RequestInit) => {
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      credentials: init?.credentials,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const defaults: Route = (c) => {
      if (c.url === config.rpcUrl && c.body?.method === "getLedgerEntries") return { body: { result: { entries: [{}] } } };
      if (c.url === config.rpcUrl && c.body?.method === "getTransaction") return { body: { result: { status: "SUCCESS" } } };
      if (c.url.includes("/api/smart-account/balances")) return { body: { balances: [{ assetId: "native", balanceRaw: opts.balanceRaw ?? "99500000000" }] } };
      return undefined;
    };
    const hit = routes(call) ?? defaults(call);
    if (!hit) throw new Error(`unexpected request ${call.method} ${url}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  };

  const adapter = new LiveDemoAdapter(config, {
    fetch: fetchImpl,
    credentials,
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) },
    hostname: opts.hostname ?? "uselatch.app",
    sleep: async () => {},
  });
  return { adapter, calls, passkeyCalls, storage };
}

const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as DemoError);
const apiCalls = (calls: Call[]) => calls.filter((c) => c.url.startsWith(config.apiUrl));

describe("live adapter", () => {
  test("refuses passkey work off uselatch.app before any request", async () => {
    const { adapter, calls } = harness(() => undefined, { hostname: "localhost" });
    const error = await rejection(adapter.createAccount());
    expect(error?.code).toBe("passkey_unsupported");
    expect(error?.message).toContain("only work on uselatch.app");
    expect(calls).toHaveLength(0);
  });

  test("create: begin, passkey, finish (deploys), confirm on testnet, remember the account", async () => {
    const { adapter, calls, passkeyCalls, storage } = harness((c) => {
      if (c.url.endsWith("/registration/begin"))
        return {
          body: {
            options: {
              challenge: b64uEncode(new Uint8Array([5, 5, 5])),
              rp: { id: "uselatch.app", name: "Latch" },
              user: { id: b64uEncode(new Uint8Array([8])), name: "demo", displayName: "Latch demo" },
              pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            },
          },
        };
      if (c.url.endsWith("/registration/finish"))
        return { body: { smartAccountAddress: ADDRESS, keyDataHex: KEY_DATA_HEX, credentialId: CREDENTIAL_ID, deployed: true } };
    });
    const steps: string[] = [];
    const account = await adapter.createAccount({ onStep: (s) => steps.push(s) });

    expect(account).toEqual({ address: ADDRESS, credentialId: CREDENTIAL_ID });
    expect(steps).toEqual(["passkey", "account", "signer"]);
    expect(apiCalls(calls).every((c) => c.credentials === "include")).toBe(true);
    const challenge = (passkeyCalls[0].options as CredentialCreationOptions).publicKey!.challenge as Uint8Array;
    expect(Array.from(challenge)).toEqual([5, 5, 5]);
    const finish = calls.find((c) => c.url.endsWith("/registration/finish"))!;
    expect((finish.body!.response as { response: { attestationObject: string } }).response.attestationObject).toBe(b64uEncode(new Uint8Array([7, 7])));
    const rpc = calls.find((c) => c.body?.method === "getLedgerEntries")!;
    expect(rpc.body!.params).toEqual({ keys: [contractInstanceLedgerKey(ADDRESS)] });
    expect(JSON.parse(storage.get(LIVE_ACCOUNT_KEY)!).keyDataHex).toBe(KEY_DATA_HEX);
  });

  test("create stops if the new account isn't on testnet", async () => {
    const { adapter, storage } = harness((c) => {
      if (c.url.endsWith("/registration/begin"))
        return { body: { options: { challenge: "AQ", rp: { id: "uselatch.app", name: "Latch" }, user: { id: "AQ", name: "d", displayName: "d" }, pubKeyCredParams: [] } } };
      if (c.url.endsWith("/registration/finish")) return { body: { smartAccountAddress: ADDRESS, keyDataHex: KEY_DATA_HEX, credentialId: CREDENTIAL_ID } };
      if (c.body?.method === "getLedgerEntries") return { body: { result: { entries: [] } } };
    });
    const error = await rejection(adapter.createAccount());
    expect(error?.code).toBe("account_deploy_failed");
    expect(error?.message).toContain("wasn’t found on Stellar testnet");
    expect(storage.has(LIVE_ACCOUNT_KEY)).toBe(false);
  });

  test("a closed passkey prompt is passkey_cancelled with nothing created", async () => {
    const { adapter } = harness(
      (c) => (c.url.endsWith("/registration/begin") ? { body: { options: { challenge: "AQ", rp: { id: "uselatch.app", name: "L" }, user: { id: "AQ", name: "d", displayName: "d" }, pubKeyCredParams: [] } } } : undefined),
      { credentials: "cancel" },
    );
    const error = await rejection(adapter.createAccount());
    expect(error?.code).toBe("passkey_cancelled");
    expect(error?.message).toContain("Nothing was created.");
  });

  test("the spending rule fails honestly before any prompt or request", async () => {
    const { adapter, calls, passkeyCalls } = harness(() => undefined, { stored: true });
    const error = await rejection(adapter.installSpendingRule({ address: ADDRESS, credentialId: CREDENTIAL_ID }, { limitStroops: BigInt(1), periodLedgers: 1 }));
    expect(error?.code).toBe("rule_install_failed");
    expect(error?.message).toContain("Nothing was changed.");
    expect(calls).toHaveLength(0);
    expect(passkeyCalls).toHaveLength(0);
  });

  test("send: setup already configured, build 50 on testnet, sign the digest, submit sigData", async () => {
    const { adapter, calls, passkeyCalls } = harness(
      (c) => {
        if (c.url.endsWith("/setup-send-rules")) return { body: { alreadyConfigured: true } };
        if (c.url.endsWith("/build-send"))
          return { body: { txXdr: "TX", authEntryXdr: "AE", authEntriesXdr: ["AE"], smartAccountAuthEntryIndex: 0, contextRuleId: 2, authDigestHex: DIGEST_HEX } };
        if (c.url.endsWith("/submit-webauthn")) return { body: { hash: "HASH", status: "SUCCESS" } };
      },
      { stored: true },
    );
    const steps: SendStep[] = [];
    const result = await adapter.send({ account: { address: ADDRESS, credentialId: CREDENTIAL_ID }, to: "GDEST", amountStroops: xlmToStroops(50), onStep: (s) => steps.push(s) });

    const build = calls.find((c) => c.url.endsWith("/build-send"))!;
    expect(build.body).toMatchObject({ network: "testnet", smartAccountAddress: ADDRESS, signerType: "passkey", assetId: "native", recipient: "GDEST", amount: "50", keyDataHex: KEY_DATA_HEX });
    const request = (passkeyCalls[0].options as CredentialRequestOptions).publicKey!;
    expect(hexEncode(new Uint8Array(request.challenge as Uint8Array))).toBe(DIGEST_HEX);
    expect(request.rpId).toBe("uselatch.app");
    const submit = calls.find((c) => c.url.endsWith("/submit-webauthn"))!;
    const expectedSig = encodeWebAuthnSigData({ authenticatorData: new Uint8Array([9, 9, 9]), clientDataJSON: new Uint8Array([123, 125]), signature: derToCompactLowS(derSignature) });
    expect(submit.body).toMatchObject({ network: "testnet", txXdr: "TX", contextRuleId: 2, keyDataHex: KEY_DATA_HEX, sigDataXdr: hexEncode(expectedSig) });
    expect(steps).toEqual(["signed", "checking", "recorded"]);
    expect(result).toEqual({ txHash: "HASH", balanceStroops: BigInt("99500000000"), usedStroops: BigInt(0) });
  });

  test("send: the first send also signs and submits the one-time XLM permission", async () => {
    const { adapter, calls, passkeyCalls } = harness(
      (c) => {
        if (c.url.endsWith("/setup-send-rules")) return { body: { txXdr: "SETUP", authEntryXdr: "SE", authDigestHex: DIGEST_HEX, remainingSetupCount: 0 } };
        if (c.url.endsWith("/build-send")) return { body: { txXdr: "TX", authEntryXdr: "AE", authDigestHex: DIGEST_HEX } };
        if (c.url.endsWith("/submit-webauthn")) return { body: { hash: "H", status: "SUCCESS" } };
      },
      { stored: true },
    );
    await adapter.send({ account: { address: ADDRESS, credentialId: CREDENTIAL_ID }, to: "GDEST", amountStroops: xlmToStroops(50) });
    expect(passkeyCalls.map((p) => p.kind)).toEqual(["get", "get"]);
    expect(calls.filter((c) => c.url.endsWith("/submit-webauthn")).map((c) => c.body!.txXdr)).toEqual(["SETUP", "TX"]);
  });

  test.each([
    [{ code: "internal_error", message: "simulation failed: Error(Contract, #3221)" }, "spending_limit_exceeded"],
    [{ code: "internal_error", message: "failed to submit transaction" }, "send_failed"],
    [{ code: "network_mismatch", message: "this deployment serves mainnet only" }, "network_unavailable"],
  ] as const)("maps submit error %j to %s", async (body, code) => {
    const { adapter } = harness(
      (c) => {
        if (c.url.endsWith("/setup-send-rules")) return { body: { alreadyConfigured: true } };
        if (c.url.endsWith("/build-send")) return { body: { txXdr: "TX", authDigestHex: DIGEST_HEX } };
        if (c.url.endsWith("/submit-webauthn")) return { status: 400, body };
      },
      { stored: true },
    );
    const error = await rejection(adapter.send({ account: { address: ADDRESS, credentialId: CREDENTIAL_ID }, to: "G", amountStroops: xlmToStroops(150) }));
    expect(error?.code).toBe(code);
    expect(error?.message).toContain("Nothing was sent.");
  });

  test("fund: not configured, too little (the 10 XLM fallback), and ok", async () => {
    const unconfigured = new LiveDemoAdapter({ ...config, fundUrl: "" }, { hostname: "uselatch.app", storage: null, credentials: null, fetch: async () => new Response("{}"), sleep: async () => {} });
    expect((await rejection(unconfigured.fund({ address: ADDRESS, credentialId: "" })))?.code).toBe("funding_failed");

    const tenXlm = harness((c) => (c.url.startsWith(config.fundUrl) ? { body: { hash: "F" } } : undefined), { balanceRaw: String(xlmToStroops(10)) });
    const error = await rejection(tenXlm.adapter.fund({ address: ADDRESS, credentialId: "" }));
    expect(error?.code).toBe("funding_failed");
    expect(error?.message).toContain("at least 150");

    const ok = harness((c) => (c.url.startsWith(config.fundUrl) ? { body: { hash: "F" } } : undefined), { balanceRaw: String(xlmToStroops(10_000)) });
    expect(await ok.adapter.fund({ address: ADDRESS, credentialId: "" })).toEqual({ txHash: "F", balanceStroops: xlmToStroops(10_000) });
    expect(ok.calls[0].credentials).toBeUndefined(); // the fund route needs no cookie
  });

  test("silent restore: only an account this browser knows and the session still lists", async () => {
    const listed = harness((c) => (c.url.endsWith("/api/accounts") ? { body: { accounts: [{ smartAccountAddress: ADDRESS }] } } : undefined), { stored: true });
    expect(await listed.adapter.restoreSession()).toEqual({ address: ADDRESS, credentialId: CREDENTIAL_ID });

    const gone = harness((c) => (c.url.endsWith("/api/accounts") ? { body: { accounts: [] } } : undefined), { stored: true });
    expect(await gone.adapter.restoreSession()).toBeNull();

    const fresh = harness(() => undefined);
    expect(await fresh.adapter.restoreSession()).toBeNull();
    expect(fresh.calls).toHaveLength(0);
  });

  test("sign in: passkey ceremony, account confirmed on testnet and remembered", async () => {
    const { adapter, storage } = harness((c) => {
      if (c.url.endsWith("/authentication/begin")) return { body: { options: { challenge: "AQ", rpId: "uselatch.app" } } };
      if (c.url.endsWith("/authentication/finish")) return { body: { smartAccountAddress: ADDRESS, keyDataHex: KEY_DATA_HEX, activeCredentialId: CREDENTIAL_ID } };
    });
    expect(await adapter.restoreSession({ prompt: true })).toEqual({ address: ADDRESS, credentialId: CREDENTIAL_ID });
    expect(storage.has(LIVE_ACCOUNT_KEY)).toBe(true);
  });

  test("receipts come from Soroban RPC with a testnet explorer link", async () => {
    const { adapter } = harness(() => undefined);
    expect(await adapter.getReceipt("abc")).toEqual({ txHash: "abc", status: "success", explorerUrl: "https://stellar.expert/explorer/testnet/tx/abc" });
  });
});
