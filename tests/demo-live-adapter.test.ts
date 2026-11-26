import { describe, expect, test } from "bun:test";
import { DemoError, type SendStep } from "../lib/demo/adapter";
import { DEMO_RECIPIENT_ADDRESS, FRIENDBOT_BALANCE_STROOPS, xlmToStroops } from "../lib/demo/constants";
import { LIVE_ACCOUNT_KEY, LiveDemoAdapter, passkeyDisplayName, type LiveConfig, type LiveEnvironment } from "../lib/demo/live-adapter";
import { b64uDecode, b64uEncode } from "../lib/demo/webauthn-codec";

const ADDRESS = "CDK44EDWIUM6JTSAHPAMBFNMICGQLTBGUD3LAP7NF47Q6VBVUSPSCJIL";
const CREDENTIAL_ID = b64uEncode(new Uint8Array([1, 2, 3, 4, 5, 6]));
const KEY_DATA_HEX = "04" + "11".repeat(64) + "010203040506";
const DIGEST_HEX = "ab".repeat(32);
const ACCOUNT = { address: ADDRESS, credentialId: CREDENTIAL_ID };
const STORED = { address: ADDRESS, credentialId: CREDENTIAL_ID, keyDataHex: KEY_DATA_HEX };

const config: LiveConfig = {
  apiUrl: "/api/demo",
  friendbotUrl: "https://friendbot.example",
  rpcUrl: "https://rpc.example",
  explorerTxUrl: "https://stellar.expert/explorer/testnet/tx",
};

type Handler = (body: Record<string, unknown> | undefined, url: string) => Response | Promise<Response>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const stateJson = (balanceXlm: number, rule: boolean, usedXlm = 0) =>
  json(200, {
    deployed: true,
    balanceStroops: xlmToStroops(balanceXlm).toString(),
    rule: rule ? { id: 1, limitStroops: "1000000000", periodLedgers: 17280 } : null,
    usedStroops: xlmToStroops(usedXlm).toString(),
  });

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
}

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

function fakeCredentials(calls: { create: unknown[]; get: unknown[] }) {
  return {
    async create(options?: CredentialCreationOptions) {
      calls.create.push(options);
      return {
        id: CREDENTIAL_ID,
        rawId: b64uDecode(CREDENTIAL_ID).buffer,
        type: "public-key",
        getClientExtensionResults: () => ({}),
        response: { clientDataJSON: bytes(1), attestationObject: bytes(2), getTransports: () => ["internal"] },
      } as unknown as Credential;
    },
    async get(options?: CredentialRequestOptions) {
      calls.get.push(options);
      return {
        id: CREDENTIAL_ID,
        rawId: b64uDecode(CREDENTIAL_ID).buffer,
        type: "public-key",
        getClientExtensionResults: () => ({}),
        response: { authenticatorData: bytes(3), clientDataJSON: bytes(4), signature: bytes(5), userHandle: null },
      } as unknown as Credential;
    },
  };
}

/** An adapter whose fetch answers from `routes`, keyed by "METHOD path" (path without query). */
function setup(routes: Record<string, Handler>, options: { stored?: boolean; env?: Partial<LiveEnvironment> } = {}) {
  const requests: { key: string; url: string; body?: Record<string, unknown> }[] = [];
  const calls = { create: [] as unknown[], get: [] as unknown[] };
  const storage = memoryStorage(options.stored === false ? {} : { [LIVE_ACCOUNT_KEY]: JSON.stringify(STORED) });
  const fetch = async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = input.split("?")[0];
    const key = `${method} ${path}`;
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    requests.push({ key, url: input, body });
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected request ${key}`);
    return handler(body, input);
  };
  const adapter = new LiveDemoAdapter(config, {
    fetch,
    credentials: fakeCredentials(calls),
    storage,
    hostname: "demo.uselatch.app",
    protocol: "https:",
    sleep: async () => {},
    ...options.env,
  });
  return { adapter, requests, calls, storage };
}

async function rejection(promise: Promise<unknown>): Promise<DemoError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DemoError);
    return error as DemoError;
  }
  throw new Error("expected a rejection");
}

describe("LiveDemoAdapter (demo API, latch-playground plumbing)", () => {
  test("createAccount: options → passkey → verify (server deploys) → saved", async () => {
    const steps: string[] = [];
    const { adapter, requests, calls, storage } = setup(
      {
        "POST /api/demo/passkey/register/options": () => json(200, { token: "t1", options: { challenge: b64uEncode(new Uint8Array([9])), rp: { id: "demo.uselatch.app", name: "Latch demo" }, user: { id: b64uEncode(new Uint8Array([7])), name: "n", displayName: "n" }, pubKeyCredParams: [{ alg: -7, type: "public-key" }] } }),
        "POST /api/demo/passkey/register/verify": (body) => {
          expect(body?.token).toBe("t1");
          expect((body?.response as { id: string }).id).toBe(CREDENTIAL_ID);
          return json(200, STORED);
        },
      },
      { stored: false },
    );
    const account = await adapter.createAccount({ onStep: (s) => steps.push(s) });
    expect(account).toEqual(ACCOUNT);
    expect(steps).toEqual(["passkey", "account", "signer"]);
    expect(calls.create).toHaveLength(1);
    expect(JSON.parse(storage.data.get(LIVE_ACCOUNT_KEY)!)).toEqual(STORED);
    expect((requests[0].body?.displayName as string).startsWith("Latch demo · ")).toBe(true);
  });

  test("createAccount: a failed deploy says the passkey may remain (not 'nothing happened')", async () => {
    const { adapter } = setup(
      {
        "POST /api/demo/passkey/register/options": () => json(200, { token: "t", options: { challenge: "AQ", rp: { name: "x" }, user: { id: "Bw", name: "n", displayName: "n" }, pubKeyCredParams: [] } }),
        "POST /api/demo/passkey/register/verify": () => json(502, { code: "account_deploy_failed" }),
      },
      { stored: false },
    );
    const error = await rejection(adapter.createAccount());
    expect(error.code).toBe("account_deploy_failed");
    expect(error.nothingHappened).toBe(false);
  });

  test("passkeys refused off the demo host and on uselatch.app itself", async () => {
    for (const hostname of ["uselatch.app", "example.com"]) {
      const { adapter } = setup({}, { stored: false, env: { hostname, protocol: hostname === "example.com" ? "http:" : "https:" } });
      expect((await rejection(adapter.createAccount())).code).toBe("passkey_unsupported");
    }
  });

  test("restoreSession (silent): the stored account if it's on testnet; read errors propagate", async () => {
    const ok = setup({ "GET /api/demo/account": () => stateJson(0, false) });
    expect(await ok.adapter.restoreSession()).toEqual(ACCOUNT);
    expect(ok.requests[0].url).toBe(`/api/demo/account?address=${ADDRESS}`);

    const gone = setup({ "GET /api/demo/account": () => json(200, { deployed: false, balanceStroops: "0", rule: null, usedStroops: "0" }) });
    expect(await gone.adapter.restoreSession()).toBeNull();

    const down = setup({ "GET /api/demo/account": () => json(503, { code: "network_unavailable" }) });
    await expect(down.adapter.restoreSession()).rejects.toThrow();

    expect(await setup({}, { stored: false }).adapter.restoreSession()).toBeNull();
  });

  test("sign in: found → saved; unknown passkey → null", async () => {
    const options = () => json(200, { token: "s1", options: { challenge: "AQ" } });
    const found = setup({ "POST /api/demo/passkey/signin/options": options, "POST /api/demo/passkey/signin/verify": () => json(200, STORED) }, { stored: false });
    expect(await found.adapter.restoreSession({ prompt: true })).toEqual(ACCOUNT);
    expect(found.storage.data.has(LIVE_ACCOUNT_KEY)).toBe(true);

    const unknown = setup({ "POST /api/demo/passkey/signin/options": options, "POST /api/demo/passkey/signin/verify": () => json(404, { code: "not_found" }) }, { stored: false });
    expect(await unknown.adapter.restoreSession({ prompt: true })).toBeNull();
  });

  test("getAccountState passes this passkey's key data and throws (not 'no rule') when unreadable", async () => {
    const { adapter, requests } = setup({ "GET /api/demo/account": () => stateJson(9850, true, 50) });
    const state = await adapter.getAccountState(ACCOUNT);
    expect(state).toEqual({ balanceStroops: xlmToStroops(9850), rule: { limitStroops: BigInt(1_000_000_000), periodLedgers: 17280 }, usedStroops: xlmToStroops(50) });
    expect(requests[0].url).toContain(`keyDataHex=${KEY_DATA_HEX}`);

    const down = setup({ "GET /api/demo/account": () => json(503, { code: "network_unavailable" }) });
    expect((await rejection(down.adapter.getAccountState(ACCOUNT))).code).toBe("network_unavailable");
  });

  test("fund: Friendbot then the balance; a failed read after Friendbot succeeded is not an error", async () => {
    const funded = setup({
      "GET https://friendbot.example/": () => json(200, { hash: "fb" }),
      "GET /api/demo/account": () => stateJson(10_000, false),
    });
    expect(await funded.adapter.fund(ACCOUNT)).toEqual({ txHash: "fb", balanceStroops: xlmToStroops(10_000) });

    const unreadable = setup({
      "GET https://friendbot.example/": () => json(200, { hash: "fb" }),
      "GET /api/demo/account": () => json(503, { code: "network_unavailable" }),
    });
    expect(await unreadable.adapter.fund(ACCOUNT)).toEqual({ txHash: "fb", balanceStroops: FRIENDBOT_BALANCE_STROOPS });

    const tooLittle = setup({ "GET https://friendbot.example/": () => json(200, {}), "GET /api/demo/account": () => stateJson(10, false) });
    expect((await rejection(tooLittle.adapter.fund(ACCOUNT))).code).toBe("funding_failed");
  });

  test("installSpendingRule: prepare → passkey signs the digest → submit", async () => {
    const { adapter, requests, calls } = setup({
      "POST /api/demo/prepare": (body) => {
        expect(body).toEqual({ action: "install-limit", address: ADDRESS, keyDataHex: KEY_DATA_HEX });
        return json(200, { token: "p1", authDigestHex: DIGEST_HEX });
      },
      "POST /api/demo/submit": (body) => {
        expect(body?.token).toBe("p1");
        expect(body?.assertion).toEqual({ authenticatorData: b64uEncode(new Uint8Array([3])), clientDataJSON: b64uEncode(new Uint8Array([4])), signature: b64uEncode(new Uint8Array([5])) });
        return json(200, { hash: "h1", status: "success" });
      },
    });
    const result = await adapter.installSpendingRule(ACCOUNT, { limitStroops: BigInt(1), periodLedgers: 1 });
    expect(result.txHash).toBe("h1");
    expect(result.rule).toEqual({ limitStroops: BigInt(1_000_000_000), periodLedgers: 17_280 });
    const publicKey = (calls.get[0] as CredentialRequestOptions).publicKey!;
    expect(Buffer.from(publicKey.challenge as Uint8Array).toString("hex")).toBe(DIGEST_HEX);
    expect(publicKey.userVerification).toBe("required");
    expect(requests.map((r) => r.key)).toEqual(["POST /api/demo/prepare", "POST /api/demo/submit"]);
  });

  test("installSpendingRule: already installed → no passkey prompt", async () => {
    const { adapter, calls } = setup({ "POST /api/demo/prepare": () => json(200, { installed: true }) });
    expect((await adapter.installSpendingRule(ACCOUNT, { limitStroops: BigInt(1), periodLedgers: 1 })).txHash).toBe("");
    expect(calls.get).toHaveLength(0);
  });

  test("installSpendingRule: a failed transaction is an error, never 'limit active'", async () => {
    const { adapter } = setup({
      "POST /api/demo/prepare": () => json(200, { token: "p", authDigestHex: DIGEST_HEX }),
      "POST /api/demo/submit": () => json(200, { hash: "h", status: "failed" }),
    });
    expect((await rejection(adapter.installSpendingRule(ACCOUNT, { limitStroops: BigInt(1), periodLedgers: 1 }))).code).toBe("rule_install_failed");
  });

  test("installSpendingRule: pending is only success once the rule is read back on chain", async () => {
    let reads = 0;
    const confirmed = setup({
      "POST /api/demo/prepare": () => json(200, { token: "p", authDigestHex: DIGEST_HEX }),
      "POST /api/demo/submit": () => json(200, { hash: "h", status: "pending" }),
      "GET /api/demo/account": () => stateJson(10_000, ++reads >= 2),
    });
    expect((await confirmed.adapter.installSpendingRule(ACCOUNT, { limitStroops: BigInt(1), periodLedgers: 1 })).txHash).toBe("h");

    const never = setup({
      "POST /api/demo/prepare": () => json(200, { token: "p", authDigestHex: DIGEST_HEX }),
      "POST /api/demo/submit": () => json(200, { hash: "h", status: "pending" }),
      "GET /api/demo/account": () => stateJson(10_000, false),
    });
    const error = await rejection(never.adapter.installSpendingRule(ACCOUNT, { limitStroops: BigInt(1), periodLedgers: 1 }));
    expect(error.code).toBe("rule_install_failed");
    expect(error.nothingHappened).toBe(false);
  });

  test("send 50: prepare (amount in stroops) → sign → submit → recorded", async () => {
    const steps: SendStep[] = [];
    const { adapter } = setup({
      "POST /api/demo/prepare": (body) => {
        expect(body).toEqual({ action: "send", address: ADDRESS, keyDataHex: KEY_DATA_HEX, to: DEMO_RECIPIENT_ADDRESS, amountStroops: "500000000" });
        return json(200, { token: "p", authDigestHex: DIGEST_HEX });
      },
      "POST /api/demo/submit": () => json(200, { hash: "h50", status: "success" }),
      "GET /api/demo/account": () => stateJson(9_950, true, 50),
    });
    const result = await adapter.send({ account: ACCOUNT, to: DEMO_RECIPIENT_ADDRESS, amountStroops: xlmToStroops(50), onStep: (s) => steps.push(s) });
    expect(result).toEqual({ txHash: "h50", status: "success", balanceStroops: xlmToStroops(9_950), usedStroops: xlmToStroops(50) });
    expect(steps).toEqual(["signed", "checking", "recorded"]);
  });

  test("tiny amounts go to the server as exact stroops (no '1e-7')", async () => {
    const { adapter, requests } = setup({
      "POST /api/demo/prepare": () => json(200, { token: "p", authDigestHex: DIGEST_HEX }),
      "POST /api/demo/submit": () => json(200, { hash: "h", status: "success" }),
      "GET /api/demo/account": () => stateJson(1, true),
    });
    await adapter.send({ account: ACCOUNT, to: DEMO_RECIPIENT_ADDRESS, amountStroops: BigInt(1) });
    expect(requests[0].body?.amountStroops).toBe("1");
  });

  test("send 150: the rule says no → spending_limit_exceeded, nothing recorded", async () => {
    const steps: SendStep[] = [];
    const { adapter } = setup({
      "POST /api/demo/prepare": () => json(200, { token: "p", authDigestHex: DIGEST_HEX }),
      "POST /api/demo/submit": () => json(422, { code: "spending_limit_exceeded", contractErrorCode: 3221 }),
    });
    const error = await rejection(adapter.send({ account: ACCOUNT, to: DEMO_RECIPIENT_ADDRESS, amountStroops: xlmToStroops(150), onStep: (s) => steps.push(s) }));
    expect(error.code).toBe("spending_limit_exceeded");
    expect(error.contractErrorCode).toBe(3221);
    expect(steps).not.toContain("recorded");
  });

  test("send: pending stays pending, and a balance read failure after a confirmed send is not an error", async () => {
    const pending = setup({
      "POST /api/demo/prepare": () => json(200, { token: "p", authDigestHex: DIGEST_HEX }),
      "POST /api/demo/submit": () => json(200, { hash: "hp", status: "pending" }),
      "GET /api/demo/account": () => json(503, { code: "network_unavailable" }),
    });
    const steps: SendStep[] = [];
    expect(await pending.adapter.send({ account: ACCOUNT, to: DEMO_RECIPIENT_ADDRESS, amountStroops: xlmToStroops(50), onStep: (s) => steps.push(s) })).toEqual({
      txHash: "hp",
      status: "pending",
      balanceStroops: null,
      usedStroops: null,
    });
    expect(steps).not.toContain("recorded");
  });

  test("send: no spending limit yet → a clear error, nothing sent", async () => {
    const { adapter, calls } = setup({ "POST /api/demo/prepare": () => json(409, { code: "rule_missing" }) });
    const error = await rejection(adapter.send({ account: ACCOUNT, to: DEMO_RECIPIENT_ADDRESS, amountStroops: xlmToStroops(50) }));
    expect(error.code).toBe("send_failed");
    expect(calls.get).toHaveLength(0);
  });

  test("reset forgets the account on this device", async () => {
    const { adapter, storage } = setup({});
    await adapter.reset();
    expect(storage.data.has(LIVE_ACCOUNT_KEY)).toBe(false);
  });

  test("passkeyDisplayName", () => {
    expect(passkeyDisplayName(new Date(2026, 10, 25, 19, 35)).startsWith("Latch demo · ")).toBe(true);
  });
});
