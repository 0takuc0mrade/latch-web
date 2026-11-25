/**
 * Transaction pieces the live adapter builds in the browser. Loaded with a
 * dynamic import from live-adapter.ts, so @stellar/stellar-base only ships
 * when live mode actually runs.
 *
 * Formats follow latch-api (internal/service/webapp: buildWebAuthnAuthPayload,
 * submitWithBundler) and OpenZeppelin stellar-accounts 0.7.2 (add_policy,
 * SpendingLimitAccountParams).
 */
import { Account, Address, Asset, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-base";
// No global Buffer in browser bundles; stellar-base's own dependency provides it.
import { Buffer } from "buffer";
import { DEMO_PERIOD_LEDGERS, DEMO_SPENDING_LIMIT_STROOPS, SPENDING_LIMIT_POLICY_ADDRESS } from "./constants";

export const TESTNET_PASSPHRASE = Networks.TESTNET;

/** The native XLM Stellar Asset Contract on testnet: what the XLM send rule covers. */
export const NATIVE_XLM_CONTRACT = Asset.native().contractId(TESTNET_PASSPHRASE);

/** OZ spending_limit errors (stellar-accounts 0.7.2). */
export const SPENDING_LIMIT_EXCEEDED = 3221;
/** The policy rejects anything but `transfer` (e.g. if a send is signed against the wrong rule). */
export const SPENDING_LIMIT_NOT_ALLOWED = 3223;
export const POLICY_ALREADY_INSTALLED = 3225;
/** Smart account error when the rule already has this policy (raised before the policy's own check). */
export const POLICY_DUPLICATE_ON_RULE = 3009;

/** Rule names are capped at 20 bytes (OZ MAX_NAME_SIZE). */
export const XLM_RULE_NAME = "XLM 100 per 24h";

/** SpendingLimitAccountParams { period_ledgers, spending_limit } as a symbol-keyed map (sorted keys). */
function spendingLimitInstallParam(): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("period_ledgers"), val: xdr.ScVal.scvU32(DEMO_PERIOD_LEDGERS) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("spending_limit"), val: nativeToScVal(DEMO_SPENDING_LIMIT_STROOPS, { type: "i128" }) }),
  ]);
}

/**
 * Host function for smart account `add_context_rule(context_type, name, valid_until, signers, policies)`
 * creating the demo's XLM rule: CallContract(native XLM), signed by this passkey
 * (Signer::External(verifier, key_data)), with the spending-limit policy installed
 * in the same call. latch-api's setup-send-rules doesn't create a per-asset rule
 * when the Default rule already lists the passkey, so the browser creates it.
 */
export function addLimitedXlmRuleHostFunction(accountAddress: string, verifierAddress: string, keyData: Uint8Array): xdr.HostFunction {
  const contextType = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("CallContract"), new Address(NATIVE_XLM_CONTRACT).toScVal()]);
  const signer = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("External"), new Address(verifierAddress).toScVal(), xdr.ScVal.scvBytes(Buffer.from(keyData))]);
  const policies = xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: new Address(SPENDING_LIMIT_POLICY_ADDRESS).toScVal(), val: spendingLimitInstallParam() })]);
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(accountAddress).toScAddress(),
      functionName: "add_context_rule",
      args: [contextType, xdr.ScVal.scvString(XLM_RULE_NAME), xdr.ScVal.scvVoid(), xdr.ScVal.scvVec([signer]), policies],
    }),
  );
}

/**
 * Host function for smart account `add_policy(context_rule_id, policy, install_param)`
 * with the demo's fixed policy: SpendingLimitAccountParams { period_ledgers, spending_limit }
 * as a symbol-keyed map in sorted key order.
 */
export function addSpendingPolicyHostFunction(accountAddress: string, contextRuleId: number): xdr.HostFunction {
  const installParam = spendingLimitInstallParam();
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(accountAddress).toScAddress(),
      functionName: "add_policy",
      args: [xdr.ScVal.scvU32(contextRuleId), new Address(SPENDING_LIMIT_POLICY_ADDRESS).toScVal(), installParam],
    }),
  );
}

/**
 * One-operation transaction around a host function. latch-api's prepare-sign
 * simulates it as given and submitWithBundler re-wraps only the host function
 * and auth with the bundler as source, so the source here only needs to be a
 * valid account id (sequence is irrelevant).
 */
export function invokeTransaction(hostFunction: xdr.HostFunction, sourceAccount: string, auth: xdr.SorobanAuthorizationEntry[] = []): string {
  return new TransactionBuilder(new Account(sourceAccount, "0"), { fee: "100", networkPassphrase: TESTNET_PASSPHRASE })
    .addOperation(Operation.invokeHostFunction({ func: hostFunction, auth }))
    .setTimeout(300)
    .build()
    .toXDR();
}

/** The host function inside a transaction latch-api built (build-send, prepare-sign). */
export function hostFunctionOf(txXdr: string): xdr.HostFunction {
  const envelope = xdr.TransactionEnvelope.fromXDR(txXdr, "base64");
  const op = envelope.v1().tx().operations()[0];
  return op.body().invokeHostFunctionOp().hostFunction();
}

/**
 * AuthPayload { context_rule_ids, signers: { External(verifier, key_data): sig_data } },
 * exactly as latch-api's buildWebAuthnAuthPayload builds it.
 */
export function webAuthnAuthPayload(verifierAddress: string, keyData: Uint8Array, sigDataXdr: Uint8Array, contextRuleIds: number[]): xdr.ScVal {
  const signerKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    new Address(verifierAddress).toScVal(),
    xdr.ScVal.scvBytes(Buffer.from(keyData)),
  ]);
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("context_rule_ids"), val: xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("signers"), val: xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: signerKey, val: xdr.ScVal.scvBytes(Buffer.from(sigDataXdr)) })]) }),
  ]);
}

/** Auth entries with the smart account's entry signed by the passkey payload. */
export function signedAuthEntries(entriesXdr: string[], smartAccountIndex: number, payload: xdr.ScVal): xdr.SorobanAuthorizationEntry[] {
  return entriesXdr.map((entryXdr, index) => {
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, "base64");
    if (index === smartAccountIndex) entry.credentials().address().signature(payload);
    return entry;
  });
}

/** "Error(Contract, #3221)" → 3221, from a simulation or submission error string. */
export function contractErrorCode(message: string | undefined): number | null {
  const match = /Error\(Contract, #(\d+)\)/.exec(message ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * The contract error behind a failed simulation. A policy that panics inside
 * __check_auth surfaces as "Error(Auth, InvalidAction)" in the error string;
 * the policy's own code (e.g. 3221) is in the diagnostic events. Prefers the
 * spending-limit codes when several contract errors appear.
 */
export function simulationContractError(sim: { error?: string; events?: string[] }): number | null {
  const codes: number[] = [];
  const direct = contractErrorCode(sim.error);
  if (direct !== null) codes.push(direct);
  for (const raw of sim.events ?? []) {
    try {
      const body = xdr.DiagnosticEvent.fromXDR(raw, "base64").event().body().v0();
      for (const val of [...body.topics(), body.data()]) {
        if (val.switch().name === "scvError" && val.error().switch().name === "sceContract") codes.push(val.error().contractCode());
      }
    } catch {
      /* not a diagnostic event we can read */
    }
  }
  return codes.find((c) => c >= 3220 && c <= 3229) ?? codes[0] ?? null;
}

/** Host function for the policy's `get_spending_limit_data(context_rule_id, smart_account)`. */
export function spendingDataHostFunction(accountAddress: string, contextRuleId: number): xdr.HostFunction {
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(SPENDING_LIMIT_POLICY_ADDRESS).toScAddress(),
      functionName: "get_spending_limit_data",
      args: [xdr.ScVal.scvU32(contextRuleId), new Address(accountAddress).toScVal()],
    }),
  );
}

export interface SpendingData {
  limitStroops: bigint;
  periodLedgers: number;
  /** Spent inside the rolling window ending at `atLedger`. */
  usedStroops: bigint;
}

/** Decode SpendingLimitData and sum the history still inside the window (what enforce() would count). */
export function parseSpendingData(retvalXdr: string, atLedger: number): SpendingData {
  const data = scValToNative(xdr.ScVal.fromXDR(retvalXdr, "base64")) as {
    spending_limit: bigint;
    period_ledgers: number;
    spending_history: { amount: bigint; ledger_sequence: number }[];
  };
  const windowStart = atLedger - Number(data.period_ledgers);
  const used = data.spending_history
    .filter((entry) => Number(entry.ledger_sequence) > windowStart)
    .reduce((sum, entry) => sum + BigInt(entry.amount), BigInt(0));
  return { limitStroops: BigInt(data.spending_limit), periodLedgers: Number(data.period_ledgers), usedStroops: used };
}

/**
 * Host function for the native XLM contract's `balance(id)`: works for G and C
 * addresses. Mirrors latch's nativeBalance (lib/demo-server.ts), which reads
 * the balance the same way so a network failure never looks like 0 XLM.
 */
export function nativeBalanceHostFunction(address: string): xdr.HostFunction {
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(NATIVE_XLM_CONTRACT).toScAddress(),
      functionName: "balance",
      args: [new Address(address).toScVal()],
    }),
  );
}

/** An i128 return value (e.g. a balance) in stroops. */
export function parseI128(retvalXdr: string): bigint {
  return BigInt(scValToNative(xdr.ScVal.fromXDR(retvalXdr, "base64")) as bigint);
}

/** Checksum-verified G… or C… address (latch validates recipients with StrKey the same way). */
export function isValidRecipient(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address);
}
