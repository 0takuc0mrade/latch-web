import { describe, expect, test } from "bun:test";
import { createSign, generateKeyPairSync } from "node:crypto";
import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-base";
import { DemoError, type SendStep } from "../lib/demo/adapter";
import { DEMO_RECIPIENT_ADDRESS, SPENDING_LIMIT_POLICY_ADDRESS, xlmToStroops } from "../lib/demo/constants";
import { LIVE_ACCOUNT_KEY, LiveDemoAdapter, passkeyDisplayName, type LiveConfig } from "../lib/demo/live-adapter";
import { NATIVE_XLM_CONTRACT, invokeTransaction } from "../lib/demo/soroban-tx";
import { b64uEncode, contractInstanceLedgerKey, derToCompactLowS, encodeWebAuthnSigData, hexEncode } from "../lib/demo/webauthn-codec";

const ADDRESS = "CDK44EDWIUM6JTSAHPAMBFNMICGQLTBGUD3LAP7NF47Q6VBVUSPSCJIL";
const VERIFIER = "CANZCUBUIR5U5C5O5H3XAYI73C6HIBISMABUU4UGGHI2YDCCDS7G6KD5";
const CREDENTIAL_ID = b64uEncode(new Uint8Array([1, 2, 3, 4, 5, 6]));
const KEY_DATA_HEX = "04" + "11".repeat(64) + "010203040506";
const DIGEST_HEX = "ab".repeat(32);

const config: LiveConfig = {
  apiUrl: "https://api.example",
  friendbotUrl: "https://friendbot.example",
  rpcUrl: "https://rpc.example",
  rpId: "uselatch.app",
  explorerTxUrl: "https://stellar.expert/explorer/testnet/tx",
};

/* ---- realistic XDR fixtures ---------------------------------------------- */

function transferFn(amountXlm: number) {
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(NATIVE_XLM_CONTRACT).toScAddress(),
      functionName: "transfer",
      args: [new Address(ADDRESS).toScVal(), new Address(DEMO_RECIPIENT_ADDRESS).toScVal(), nativeToScVal(xlmToStroops(amountXlm), { type: "i128" })],
    }),
  );
}

function authEntry(fn: xdr.HostFunction): string {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({ address: new Address(ADDRESS).toScAddress(), nonce: xdr.Int64.fromString("7"), signatureExpirationLedger: 99, signature: xdr.ScVal.scvVoid() }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(fn.invokeContract()), subInvocations: [] }),
  }).toXDR("base64");
}

/** What latch-api's build-send / prepare-sign return for a host function. */
function authBuild(fn: xdr.HostFunction, ruleIds: number[]) {
  return { txXdr: invokeTransaction(fn, DEMO_RECIPIENT_ADDRESS), authEntryXdr: authEntry(fn), authEntriesXdr: [authEntry(fn)], smartAccountAuthEntryIndex: 0, contextRuleId: ruleIds[0], contextRuleIds: ruleIds, authDigestHex: DIGEST_HEX };
}

function errorEvent(code: number): string {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: false,
    event: new xdr.ContractEvent({
      ext: new xdr.ExtensionPoint(0),
      contractId: null,
      type: xdr.ContractEventType.diagnostic(),
      body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics: [xdr.ScVal.scvSymbol("error"), xdr.ScVal.scvError(xdr.ScError.sceContract(code))], data: xdr.ScVal.scvVoid() })),
    }),
  }).toXDR("base64");
}

function spendingData(usedXlm: number, atLedger: number) {
  const history = usedXlm
    ? [xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount"), val: nativeToScVal(xlmToStroops(usedXlm), { type: "i128" }) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ledger_sequence"), val: xdr.ScVal.scvU32(atLedger - 10) }),
      ])]
    : [];
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("cached_total_spent"), val: nativeToScVal(xlmToStroops(usedXlm), { type: "i128" }) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("period_ledgers"), val: xdr.ScVal.scvU32(17_280) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("spending_history"), val: xdr.ScVal.scvVec(history) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("spending_limit"), val: nativeToScVal(BigInt(1_000_000_000), { type: "i128" }) }),
  ]).toXDR("base64");
}

const SIGNER = { kind: "External", verifierAddress: VERIFIER, keyDataHex: KEY_DATA_HEX };
const DEFAULT_RULE = { id: 0, signers: [SIGNER] };
const XLM_RULE = { id: 1, callContractAddress: NATIVE_XLM_CONTRACT, signers: [SIGNER] };

/* ---- harness ------------------------------------------------------------- */

interface Call {
  url: string;
  method: string;
  credentials?: RequestCredentials;
  body: Record<string, unknown> | null;
}
type Reply = { status?: number; body: unknown } | undefined;

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const derSignature = new Uint8Array(createSign("SHA256").update("x").sign(privateKey));
const buf = (bytes: number[] | Uint8Array) => new Uint8Array(bytes).buffer;
const SIG_DATA = encodeWebAuthnSigData({ authenticatorData: new Uint8Array([9, 9, 9]), clientDataJSON: new Uint8Array([123, 125]), signature: derToCompactLowS(derSignature) });

interface Options {
  hostname?: string;
  protocol?: string;
  credentials?: "ok" | "cancel";
  stored?: boolean;
  balanceRaw?: string;
  rules?: unknown[];
  /** enforce-mode simulation of a signed transaction */
  enforce?: "ok" | "blocked" | "other" | "unavailable";
  /** record-mode probe of add_policy on an existing XLM rule */
  probe?: "duplicate" | "ok";
  usedXlm?: number;
}

function harness(routes: (call: Call) => Reply, opts: Options = {}) {
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

  const rpcReply = (c: Call): Reply => {
    const method = c.body?.method;
    const params = c.body?.params as { transaction?: string; authMode?: string };
    if (method === "getLedgerEntries") return { body: { result: { entries: [{}] } } };
    if (method === "getTransaction") return { body: { result: { status: "SUCCESS" } } };
    if (method !== "simulateTransaction") return undefined;
    const fnName = xdr.TransactionEnvelope.fromXDR(params.transaction!, "base64").v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().functionName().toString();
    if (params.authMode === "enforce") {
      if (opts.enforce === "unavailable") return { status: 503, body: { error: { message: "down" } } };
      if (opts.enforce === "blocked") return { body: { result: { error: "HostError: Error(Auth, InvalidAction)", events: [errorEvent(3221)], latestLedger: 100 } } };
      if (opts.enforce === "other") return { body: { result: { error: "HostError: Error(Contract, #10)", latestLedger: 100 } } };
      return { body: { result: { results: [{ xdr: xdr.ScVal.scvVoid().toXDR("base64") }], latestLedger: 100 } } };
    }
    if (fnName === "add_policy") {
      return opts.probe === "duplicate"
        ? { body: { result: { error: "HostError: Error(Contract, #3009)", latestLedger: 100 } } }
        : { body: { result: { results: [{ xdr: xdr.ScVal.scvU32(1).toXDR("base64") }], latestLedger: 100 } } };
    }
    if (fnName === "get_spending_limit_data") return { body: { result: { results: [{ xdr: spendingData(opts.usedXlm ?? 0, 20_000) }], latestLedger: 20_000 } } };
    return undefined;
  };

  const fetchImpl = async (url: string, init?: RequestInit) => {
    const call: Call = { url, method: init?.method ?? "GET", credentials: init?.credentials, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const defaults = (c: Call): Reply => {
      if (c.url === config.rpcUrl) return rpcReply(c);
      if (c.url.includes("/api/smart-account/balances")) return { body: { balances: [{ assetId: "native", balanceRaw: opts.balanceRaw ?? "99500000000" }] } };
      if (c.url.includes("/api/smart-account/context-rules")) return { body: { rules: opts.rules ?? [DEFAULT_RULE] } };
      return undefined;
    };
    const hit = routes(call) ?? defaults(call);
    if (!hit) throw new Error(`unexpected request ${call.method} ${url} ${JSON.stringify(call.body)?.slice(0, 80)}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  };

  const adapter = new LiveDemoAdapter(config, {
    fetch: fetchImpl,
    credentials,
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) },
    hostname: opts.hostname ?? "uselatch.app",
    protocol: opts.protocol ?? "https:",
    sleep: async () => {},
  });
  return { adapter, calls, passkeyCalls, storage };
}

const ACCOUNT = { address: ADDRESS, credentialId: CREDENTIAL_ID };
const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as DemoError);
const apiCalls = (calls: Call[]) => calls.filter((c) => c.url.startsWith(config.apiUrl));
const enforceCalls = (calls: Call[]) => calls.filter((c) => (c.body?.params as { authMode?: string } | undefined)?.authMode === "enforce");
const submits = (calls: Call[]) => calls.filter((c) => c.url.endsWith("/submit-webauthn"));

/* ---- tests ----------------------------------------------------------------- */

describe("live adapter: host and account", () => {
  test.each([
    ["localhost", "http:"],
    ["latch-web.vercel.app", "https:"],
    ["uselatch.app", "http:"],
  ])("refuses passkey work on %s (%s) before any request", async (hostname, protocol) => {
    const { adapter, calls } = harness(() => undefined, { hostname, protocol });
    const error = await rejection(adapter.createAccount());
    expect(error?.code).toBe("passkey_unsupported");
    expect(error?.message).toContain("only work on uselatch.app");
    expect(calls).toHaveLength(0);
  });

  test("any https subdomain of uselatch.app is allowed", async () => {
    const { adapter, calls } = harness(() => ({ status: 500, body: {} }), { hostname: "demo.uselatch.app" });
    await rejection(adapter.createAccount());
    expect(calls[0].url).toBe(`${config.apiUrl}/api/webauthn/registration/begin`);
  });

  test("create: begin, passkey, finish (deploys), confirm on testnet, remember the account", async () => {
    const { adapter, calls, passkeyCalls, storage } = harness((c) => {
      if (c.url.endsWith("/registration/begin"))
        return { body: { options: { challenge: b64uEncode(new Uint8Array([5, 5, 5])), rp: { id: "uselatch.app", name: "Latch" }, user: { id: b64uEncode(new Uint8Array([8])), name: "demo", displayName: "Latch demo" }, pubKeyCredParams: [{ alg: -7, type: "public-key" }] } } };
      if (c.url.endsWith("/registration/finish")) return { body: { smartAccountAddress: ADDRESS, keyDataHex: KEY_DATA_HEX, credentialId: CREDENTIAL_ID, deployed: true } };
    });
    const steps: string[] = [];
    expect(await adapter.createAccount({ onStep: (s) => steps.push(s) })).toEqual(ACCOUNT);
    expect(steps).toEqual(["passkey", "account", "signer"]);
    expect(apiCalls(calls).every((c) => c.credentials === "include")).toBe(true);
    expect(Array.from((passkeyCalls[0].options as CredentialCreationOptions).publicKey!.challenge as Uint8Array)).toEqual([5, 5, 5]);
    // The on-chain verifier needs user verification, so create insists on it.
    expect((passkeyCalls[0].options as CredentialCreationOptions).publicKey!.authenticatorSelection?.userVerification).toBe("required");
    expect(calls.find((c) => c.body?.method === "getLedgerEntries")!.body!.params).toEqual({ keys: [contractInstanceLedgerKey(ADDRESS)] });
    expect(JSON.parse(storage.get(LIVE_ACCOUNT_KEY)!).keyDataHex).toBe(KEY_DATA_HEX);
  });

  test("create stops if the new account isn't on testnet", async () => {
    const { adapter, storage } = harness((c) => {
      if (c.url.endsWith("/registration/begin")) return { body: { options: { challenge: "AQ", rp: { id: "uselatch.app", name: "L" }, user: { id: "AQ", name: "d", displayName: "d" }, pubKeyCredParams: [] } } };
      if (c.url.endsWith("/registration/finish")) return { body: { smartAccountAddress: ADDRESS, keyDataHex: KEY_DATA_HEX, credentialId: CREDENTIAL_ID } };
      if (c.body?.method === "getLedgerEntries") return { body: { result: { entries: [] } } };
    });
    const error = await rejection(adapter.createAccount());
    expect(error?.code).toBe("account_deploy_failed");
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

  test("silent restore and sign in", async () => {
    const listed = harness((c) => (c.url.endsWith("/api/accounts") ? { body: { accounts: [{ smartAccountAddress: ADDRESS }] } } : undefined), { stored: true });
    expect(await listed.adapter.restoreSession()).toEqual(ACCOUNT);
    const gone = harness((c) => (c.url.endsWith("/api/accounts") ? { body: { accounts: [] } } : undefined), { stored: true });
    expect(await gone.adapter.restoreSession()).toBeNull();
    const signIn = harness((c) => {
      if (c.url.endsWith("/authentication/begin")) return { body: { options: { challenge: "AQ", rpId: "uselatch.app" } } };
      if (c.url.endsWith("/authentication/finish")) return { body: { smartAccountAddress: ADDRESS, keyDataHex: KEY_DATA_HEX, activeCredentialId: CREDENTIAL_ID } };
    });
    expect(await signIn.adapter.restoreSession({ prompt: true })).toEqual(ACCOUNT);
    expect(signIn.storage.has(LIVE_ACCOUNT_KEY)).toBe(true);
  });
});

describe("live adapter: funding", () => {
  test("Friendbot directly on the C-address, then the 150 XLM minimum", async () => {
    const ok = harness((c) => (c.url.startsWith(config.friendbotUrl) ? { body: { hash: "F" } } : undefined), { balanceRaw: String(xlmToStroops(10_000)) });
    expect(await ok.adapter.fund(ACCOUNT)).toEqual({ txHash: "F", balanceStroops: xlmToStroops(10_000) });
    expect(ok.calls[0].url).toBe(`${config.friendbotUrl}/?addr=${ADDRESS}`);
    expect(ok.calls[0].credentials).toBeUndefined();

    const already = harness((c) => (c.url.startsWith(config.friendbotUrl) ? { status: 400, body: { detail: "already funded" } } : undefined), { balanceRaw: String(xlmToStroops(10_000)) });
    expect((await already.adapter.fund(ACCOUNT)).balanceStroops).toBe(xlmToStroops(10_000));

    const tiny = harness((c) => (c.url.startsWith(config.friendbotUrl) ? { body: {} } : undefined), { balanceRaw: String(xlmToStroops(10)) });
    expect((await rejection(tiny.adapter.fund(ACCOUNT)))?.message).toContain("at least 150");

    const busy = harness((c) => (c.url.startsWith(config.friendbotUrl) ? { status: 429, body: {} } : undefined));
    expect((await rejection(busy.adapter.fund(ACCOUNT)))?.code).toBe("funding_failed");
  });
});

describe("live adapter: spending rule (built in the browser)", () => {
  const prepared = (c: Call): Reply => {
    if (c.url.endsWith("/prepare-sign")) {
      const fn = xdr.TransactionEnvelope.fromXDR(String(c.body!.unsignedTxXdr), "base64").v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction();
      return { body: authBuild(fn, [0]) };
    }
    if (c.url.endsWith("/submit-webauthn")) return { body: { hash: "RULE", status: "SUCCESS" } };
  };

  test("no XLM rule yet: add_context_rule with the policy, one passkey prompt, enforce-checked, submitted", async () => {
    const { adapter, calls, passkeyCalls } = harness(prepared, { stored: true });
    const result = await adapter.installSpendingRule(ACCOUNT, { limitStroops: BigInt(1), periodLedgers: 1 });
    expect(result.txHash).toBe("RULE");
    expect(result.rule).toEqual({ limitStroops: BigInt(1_000_000_000), periodLedgers: 17_280 });

    const prep = calls.find((c) => c.url.endsWith("/prepare-sign"))!;
    expect(prep.body).toMatchObject({ network: "testnet", smartAccountAddress: ADDRESS, signerType: "passkey", keyDataHex: KEY_DATA_HEX });
    const fn = xdr.TransactionEnvelope.fromXDR(String(prep.body!.unsignedTxXdr), "base64").v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction();
    expect(fn.invokeContract().functionName().toString()).toBe("add_context_rule");
    const policies = scValToNative(fn.invokeContract().args()[4]) as Record<string, unknown>;
    expect(policies[SPENDING_LIMIT_POLICY_ADDRESS]).toEqual({ period_ledgers: 17_280, spending_limit: BigInt(1_000_000_000) });

    expect(passkeyCalls.map((p) => p.kind)).toEqual(["get"]);
    expect(enforceCalls(calls)).toHaveLength(1);
    expect(submits(calls)[0].body).toMatchObject({ network: "testnet", sigDataXdr: hexEncode(SIG_DATA), keyDataHex: KEY_DATA_HEX, contextRuleId: 0 });
  });

  test("XLM rule already has the policy (3009): nothing to do, no prompt", async () => {
    const { adapter, calls, passkeyCalls } = harness(prepared, { stored: true, rules: [DEFAULT_RULE, XLM_RULE], probe: "duplicate" });
    await adapter.installSpendingRule(ACCOUNT, { limitStroops: BigInt(1), periodLedgers: 1 });
    expect(passkeyCalls).toHaveLength(0);
    expect(calls.some((c) => c.url.endsWith("/prepare-sign") || c.url.endsWith("/submit-webauthn"))).toBe(false);
  });

  test("XLM rule exists without the policy: add_policy on that rule", async () => {
    const { adapter, calls } = harness(prepared, { stored: true, rules: [DEFAULT_RULE, XLM_RULE], probe: "ok" });
    await adapter.installSpendingRule(ACCOUNT, { limitStroops: BigInt(1), periodLedgers: 1 });
    const prep = calls.find((c) => c.url.endsWith("/prepare-sign"))!;
    const fn = xdr.TransactionEnvelope.fromXDR(String(prep.body!.unsignedTxXdr), "base64").v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction();
    expect(fn.invokeContract().functionName().toString()).toBe("add_policy");
    expect(scValToNative(fn.invokeContract().args()[0])).toBe(1);
  });
});

describe("live adapter: sends", () => {
  const sendRoutes = (amountXlm: number) => (c: Call): Reply => {
    if (c.url.endsWith("/build-send")) return { body: authBuild(transferFn(amountXlm), [1]) };
    if (c.url.endsWith("/submit-webauthn")) return { body: { hash: "HASH", status: "SUCCESS" } };
  };
  const send = (adapter: LiveDemoAdapter, xlm: number, steps?: SendStep[]) =>
    adapter.send({ account: ACCOUNT, to: DEMO_RECIPIENT_ADDRESS, amountStroops: xlmToStroops(xlm), onStep: (s) => steps?.push(s) });

  test("within the rule: build, passkey signs the digest, enforce simulation passes, submit; usage from the policy", async () => {
    const { adapter, calls, passkeyCalls } = harness(sendRoutes(50), { stored: true, rules: [DEFAULT_RULE, XLM_RULE], usedXlm: 50 });
    const steps: SendStep[] = [];
    const result = await send(adapter, 50, steps);

    expect(calls.find((c) => c.url.endsWith("/build-send"))!.body).toMatchObject({ network: "testnet", amount: "50", assetId: "native", recipient: DEMO_RECIPIENT_ADDRESS, keyDataHex: KEY_DATA_HEX });
    const request = (passkeyCalls[0].options as CredentialRequestOptions).publicKey!;
    expect(hexEncode(new Uint8Array(request.challenge as Uint8Array))).toBe(DIGEST_HEX);
    expect(request.userVerification).toBe("required");

    // The simulated transaction carries the passkey's AuthPayload for the XLM rule (#1).
    const simTx = xdr.TransactionEnvelope.fromXDR(String((enforceCalls(calls)[0].body!.params as { transaction: string }).transaction), "base64");
    const signature = simTx.v1().tx().operations()[0].body().invokeHostFunctionOp().auth()[0].credentials().address().signature();
    const payload = scValToNative(signature) as { context_rule_ids: number[]; signers: Map<unknown, unknown> | Record<string, unknown> };
    expect(payload.context_rule_ids).toEqual([1]);
    const signerEntry = signature.map()![1].val().map()![0];
    expect(scValToNative(signerEntry.key())).toEqual(["External", VERIFIER, Buffer.from(KEY_DATA_HEX, "hex")]);
    expect(hexEncode(new Uint8Array(signerEntry.val().bytes()))).toBe(hexEncode(SIG_DATA));

    expect(submits(calls)).toHaveLength(1);
    expect(steps).toEqual(["signed", "checking", "recorded"]);
    expect(result).toEqual({ txHash: "HASH", balanceStroops: BigInt("99500000000"), usedStroops: xlmToStroops(50) });
  });

  test("over the rule: enforce simulation finds 3221 → 'Your rule said no', nothing submitted", async () => {
    const { adapter, calls } = harness(sendRoutes(150), { stored: true, rules: [DEFAULT_RULE, XLM_RULE], enforce: "blocked" });
    const steps: SendStep[] = [];
    const error = await rejection(send(adapter, 150, steps));
    expect(error?.code).toBe("spending_limit_exceeded");
    expect(error?.contractErrorCode).toBe(3221);
    expect(error?.message).toBe("Your rule said no. Nothing was sent.");
    expect(steps).toEqual(["signed"]); // the passkey approved; the rule said no
    expect(submits(calls)).toHaveLength(0);
  });

  test("another simulation failure: plain error, nothing submitted", async () => {
    const { adapter, calls } = harness(sendRoutes(50), { stored: true, rules: [DEFAULT_RULE, XLM_RULE], enforce: "other" });
    const error = await rejection(send(adapter, 50));
    expect(error?.code).toBe("send_failed");
    expect(error?.message).toContain("Nothing was sent.");
    expect(submits(calls)).toHaveLength(0);
  });

  test("simulation unavailable: falls back to submit-webauthn, whose generic 400 is a plain error", async () => {
    const { adapter, calls } = harness(
      (c) => (c.url.endsWith("/submit-webauthn") ? { status: 400, body: { code: "internal_error", message: "failed to submit transaction" } } : sendRoutes(50)(c)),
      { stored: true, rules: [DEFAULT_RULE, XLM_RULE], enforce: "unavailable" },
    );
    const error = await rejection(send(adapter, 50));
    expect(submits(calls)).toHaveLength(1);
    expect(error?.code).toBe("send_failed");
    expect(error?.message).toBe("The payment didn’t go through. Nothing was sent.");
  });

  test("a mainnet-only backend is reported as not on testnet", async () => {
    const { adapter } = harness((c) => (c.url.endsWith("/build-send") ? { status: 400, body: { code: "network_mismatch", message: "this deployment serves mainnet only" } } : undefined), { stored: true });
    expect((await rejection(send(adapter, 50)))?.code).toBe("network_unavailable");
  });
});

describe("live adapter: warm-up", () => {
  test("one cheap GET /health per page, failures ignored", async () => {
    const { adapter, calls } = harness((c) => (c.url.endsWith("/health") ? { status: 503, body: {} } : undefined));
    adapter.warmUp();
    adapter.warmUp();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${config.apiUrl}/health`]);
    expect(calls[0].credentials).toBeUndefined();
  });
});

describe("live adapter: account state and receipts", () => {
  test("rule and rolling-window usage come from the policy on chain", async () => {
    const withRule = harness(() => undefined, { stored: true, rules: [DEFAULT_RULE, XLM_RULE], usedXlm: 100 });
    expect(await withRule.adapter.getAccountState(ACCOUNT)).toEqual({
      balanceStroops: BigInt("99500000000"),
      rule: { limitStroops: BigInt(1_000_000_000), periodLedgers: 17_280 },
      usedStroops: xlmToStroops(100),
    });
    const noRule = harness(() => undefined, { stored: true });
    expect((await noRule.adapter.getAccountState(ACCOUNT)).rule).toBeNull();
  });

  test("receipts come from Soroban RPC with a testnet explorer link", async () => {
    const { adapter } = harness(() => undefined);
    expect(await adapter.getReceipt("abc")).toEqual({ txHash: "abc", status: "success", explorerUrl: "https://stellar.expert/explorer/testnet/tx/abc" });
  });
});

describe("live adapter: latch's flow additions", () => {
  test("getBalance reads the XLM contract's balance(id) for any address (the recipient's balance)", async () => {
    const { adapter, calls } = harness((c) => {
      if (c.body?.method !== "simulateTransaction") return undefined;
      const tx = xdr.TransactionEnvelope.fromXDR(String((c.body.params as { transaction: string }).transaction), "base64");
      const invoke = tx.v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract();
      expect(invoke.functionName().toString()).toBe("balance");
      expect(scValToNative(invoke.args()[0])).toBe(DEMO_RECIPIENT_ADDRESS);
      return { body: { result: { results: [{ xdr: nativeToScVal(BigInt(123_4500000), { type: "i128" }).toXDR("base64") }], latestLedger: 1 } } };
    });
    expect(await adapter.getBalance(DEMO_RECIPIENT_ADDRESS)).toBe(BigInt(123_4500000));
    expect(calls).toHaveLength(1);
  });

  test("getBalance fails loudly instead of reporting 0 when the network can't read it", async () => {
    const { adapter } = harness((c) => (c.body?.method === "simulateTransaction" ? { body: { result: { error: "boom", latestLedger: 1 } } } : undefined));
    expect((await rejection(adapter.getBalance(DEMO_RECIPIENT_ADDRESS)))?.code).toBe("network_unavailable");
  });

  test("send refuses an address with a bad checksum before building anything", async () => {
    const { adapter, calls } = harness(() => undefined, { stored: true });
    const bad = `${DEMO_RECIPIENT_ADDRESS.slice(0, -1)}A`;
    const error = await rejection(adapter.send({ account: ACCOUNT, to: bad, amountStroops: BigInt(1) }));
    expect(error?.code).toBe("send_failed");
    expect(calls).toHaveLength(0);
  });

  test("like latch's demoServer, anything but testnet's passphrase stops the demo", async () => {
    const adapter = new LiveDemoAdapter({ ...config, networkPassphrase: "Public Global Stellar Network ; September 2015" }, {
      fetch: async () => {
        throw new Error("no request expected");
      },
      hostname: "uselatch.app",
      protocol: "https:",
    });
    const error = await rejection(adapter.createAccount());
    expect(error?.code).toBe("network_unavailable");
    expect(error?.message).toContain("requires Stellar testnet");
  });
});

describe("live adapter: reset", () => {
  test("forgets the account and ends latch-api's session through the reset route", async () => {
    const calls: { url: string; method?: string }[] = [];
    const storage = new Map<string, string>([[LIVE_ACCOUNT_KEY, "{}"]]);
    const adapter = new LiveDemoAdapter({ ...config, resetSessionUrl: "/api/demo/reset-session" }, {
      fetch: async (url, init) => {
        calls.push({ url, method: init?.method });
        return new Response(null, { status: 204 });
      },
      storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) },
    });
    await adapter.reset();
    expect(storage.has(LIVE_ACCOUNT_KEY)).toBe(false);
    expect(calls).toEqual([{ url: "/api/demo/reset-session", method: "POST" }]);
  });
});

describe("live adapter: create on a device that already has this session's passkey", () => {
  test("InvalidStateError ends the session and says to try again", async () => {
    const calls: string[] = [];
    const adapter = new LiveDemoAdapter({ ...config, resetSessionUrl: "/api/demo/reset-session" }, {
      fetch: async (url) => {
        calls.push(url);
        if (url.endsWith("/registration/begin")) {
          return new Response(JSON.stringify({ options: { challenge: "AQ", rp: { id: "uselatch.app", name: "L" }, user: { id: "AQ", name: "d", displayName: "d" }, pubKeyCredParams: [] } }));
        }
        return new Response(null, { status: 204 });
      },
      credentials: {
        create: async () => {
          throw Object.assign(new Error("already registered"), { name: "InvalidStateError" });
        },
        get: async () => null,
      } as unknown as CredentialsContainer,
      hostname: "uselatch.app",
      protocol: "https:",
    });
    const error = await rejection(adapter.createAccount());
    expect(error?.code).toBe("passkey_exists");
    expect(error?.nothingHappened).toBe(true);
    expect(calls.at(-1)).toBe("/api/demo/reset-session");
  });
});

describe("live adapter: passkey name", () => {
  test("each passkey is named with its creation time, so passkey managers can tell them apart", () => {
    const name = passkeyDisplayName(new Date(2026, 10, 25, 19, 35));
    expect(name.startsWith("Latch demo · ")).toBe(true);
    expect(name).toContain("25");
    expect(name).toMatch(/35/);
    expect(passkeyDisplayName(new Date(2026, 10, 25, 19, 36))).not.toBe(name);
  });
});
