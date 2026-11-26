import { describe, expect, test } from "bun:test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { DEMO_PERIOD_LEDGERS, DEMO_SPENDING_LIMIT_STROOPS, SPENDING_LIMIT_POLICY_ADDRESS } from "../lib/demo/constants";
import {
  NATIVE_XLM_CONTRACT,
  XLM_RULE_NAME,
  addLimitedXlmRuleHostFunction,
  addSpendingPolicyHostFunction,
  contractErrorCode,
  hostFunctionOf,
  invokeTransaction,
  parseSpendingData,
  signedAuthEntries,
  simulationContractError,
  spendingDataHostFunction,
  webAuthnAuthPayload,
} from "../lib/demo/server/soroban-tx";

const ACCOUNT = "CDK44EDWIUM6JTSAHPAMBFNMICGQLTBGUD3LAP7NF47Q6VBVUSPSCJIL";
const VERIFIER = "CANZCUBUIR5U5C5O5H3XAYI73C6HIBISMABUU4UGGHI2YDCCDS7G6KD5";
const SOURCE = Keypair.random().publicKey();
const KEY_DATA = new Uint8Array([0x04, ...new Array(64).fill(3), 9, 9]);

const args = (fn: xdr.HostFunction) => fn.invokeContract().args().map((a) => scValToNative(a));

export function errorEvent(code: number): string {
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

describe("soroban-tx", () => {
  test("XLM rule: add_context_rule(CallContract(native XLM), name, None, [passkey], { policy: 100 XLM / 17,280 ledgers })", () => {
    const fn = addLimitedXlmRuleHostFunction(ACCOUNT, VERIFIER, KEY_DATA);
    expect(Address.fromScAddress(fn.invokeContract().contractAddress()).toString()).toBe(ACCOUNT);
    expect(fn.invokeContract().functionName().toString()).toBe("add_context_rule");
    const [contextType, name, validUntil, signers, policies] = args(fn) as [unknown[], string, unknown, unknown[][], Record<string, Record<string, unknown>>];
    expect(contextType).toEqual(["CallContract", NATIVE_XLM_CONTRACT]);
    expect(name).toBe(XLM_RULE_NAME);
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(20); // OZ MAX_NAME_SIZE
    expect(validUntil).toBeNull();
    expect(signers[0][0]).toBe("External");
    expect(signers[0][1]).toBe(VERIFIER);
    expect(Array.from(signers[0][2] as Uint8Array)).toEqual(Array.from(KEY_DATA));
    expect(policies[SPENDING_LIMIT_POLICY_ADDRESS]).toEqual({ period_ledgers: DEMO_PERIOD_LEDGERS, spending_limit: DEMO_SPENDING_LIMIT_STROOPS });
  });

  test("add_policy(rule, policy, params) for an XLM rule that exists without the policy", () => {
    const fn = addSpendingPolicyHostFunction(ACCOUNT, 1);
    expect(fn.invokeContract().functionName().toString()).toBe("add_policy");
    expect(args(fn)).toEqual([1, SPENDING_LIMIT_POLICY_ADDRESS, { period_ledgers: 17_280, spending_limit: BigInt(1_000_000_000) }]);
  });

  test("invokeTransaction / hostFunctionOf round-trip", () => {
    const fn = addSpendingPolicyHostFunction(ACCOUNT, 2);
    expect(hostFunctionOf(invokeTransaction(fn, SOURCE)).toXDR("base64")).toBe(fn.toXDR("base64"));
  });

  test("AuthPayload matches latch-api's buildWebAuthnAuthPayload and lands on the smart account's entry only", () => {
    const sigData = new Uint8Array([1, 2, 3]);
    const payload = webAuthnAuthPayload(VERIFIER, KEY_DATA, sigData, [1]);
    const map = payload.map()!;
    expect(map.map((e) => e.key().sym().toString())).toEqual(["context_rule_ids", "signers"]);
    expect(scValToNative(map[0].val())).toEqual([1]);
    const signer = map[1].val().map()![0];
    expect(scValToNative(signer.key())).toEqual(["External", VERIFIER, Buffer.from(KEY_DATA)]);
    expect(Array.from(signer.val().bytes())).toEqual([1, 2, 3]);

    const entry = (address: string) =>
      new xdr.SorobanAuthorizationEntry({
        credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
          new xdr.SorobanAddressCredentials({ address: new Address(address).toScAddress(), nonce: xdr.Int64.fromString("1"), signatureExpirationLedger: 10, signature: xdr.ScVal.scvVoid() }),
        ),
        rootInvocation: new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(addSpendingPolicyHostFunction(ACCOUNT, 1).invokeContract()), subInvocations: [] }),
      }).toXDR("base64");
    const signed = signedAuthEntries([entry(VERIFIER), entry(ACCOUNT)], 1, payload);
    expect(signed[0].credentials().address().signature().switch().name).toBe("scvVoid");
    expect(signed[1].credentials().address().signature().toXDR("base64")).toBe(payload.toXDR("base64"));
  });

  test("the policy's 3221 is read from diagnostic events behind Error(Auth, InvalidAction)", () => {
    expect(simulationContractError({ error: "HostError: Error(Auth, InvalidAction)", events: [errorEvent(3221)] })).toBe(3221);
    expect(simulationContractError({ error: "HostError: Error(Contract, #3009)" })).toBe(3009);
    expect(simulationContractError({ error: "HostError: Error(Auth, InvalidAction)", events: [errorEvent(42), errorEvent(3221)] })).toBe(3221);
    expect(simulationContractError({ error: "something else" })).toBeNull();
    expect(contractErrorCode("HostError: Error(Contract, #3221)")).toBe(3221);
  });

  test("spending data: only history inside the rolling window counts (as enforce() cleans up)", () => {
    const entry = (amount: number, ledger: number) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount"), val: nativeToScVal(BigInt(amount), { type: "i128" }) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ledger_sequence"), val: xdr.ScVal.scvU32(ledger) }),
      ]);
    const data = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("cached_total_spent"), val: nativeToScVal(BigInt(0), { type: "i128" }) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("period_ledgers"), val: xdr.ScVal.scvU32(17_280) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("spending_history"), val: xdr.ScVal.scvVec([entry(500_000_000, 1_000), entry(500_000_000, 20_000)]) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("spending_limit"), val: nativeToScVal(BigInt(1_000_000_000), { type: "i128" }) }),
    ]).toXDR("base64");
    // At ledger 18,280 the cutoff is 1,000: the first entry (at 1,000) is out, the second counts.
    expect(parseSpendingData(data, 18_280)).toEqual({ limitStroops: BigInt(1_000_000_000), periodLedgers: 17_280, usedStroops: BigInt(500_000_000) });
    expect(parseSpendingData(data, 18_279).usedStroops).toBe(BigInt(1_000_000_000));
    expect(spendingDataHostFunction(ACCOUNT, 1).invokeContract().functionName().toString()).toBe("get_spending_limit_data");
  });
});
