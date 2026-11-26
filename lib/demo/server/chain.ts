/**
 * Everything the demo's API routes do on Stellar testnet, following
 * latch-playground's plumbing (lib/smart-account-factory-webauthn.ts,
 * app/api/transaction/build + submit-webauthn): the bundler key deploys each
 * passkey account through the factory and pays for every transaction, and
 * the passkey only signs the account's auth digest.
 *
 * The one addition is the spending limit: an XLM rule carrying the
 * spending-limit policy, which the account enforces inside __check_auth.
 */
import { createHash } from "node:crypto";
import {
  Account,
  Address,
  Contract,
  hash,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import type { DemoServerConfig } from "./config";
import {
  addLimitedXlmRuleHostFunction,
  addSpendingPolicyHostFunction,
  NATIVE_XLM_CONTRACT,
  nativeBalanceHostFunction,
  parseI128,
  parseSpendingData,
  simulationContractError,
  spendingDataHostFunction,
  webAuthnAuthPayload,
} from "./soroban-tx";

/** A read from the network failed: "unknown", never "empty" or "no rule". */
export class ChainReadError extends Error {}

/** The network refused a transaction before it was submitted (nothing happened). */
export class ChainRejectedError extends Error {
  constructor(
    message: string,
    readonly contractErrorCode: number | null,
  ) {
    super(message);
  }
}

const FEE = "1000000";
/** How long a prepared signature stays valid: ~5 minutes of ledgers. */
const AUTH_VALID_LEDGERS = 60;

function server(config: DemoServerConfig) {
  return new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith("http://") });
}

function bundler(config: DemoServerConfig) {
  return Keypair.fromSecret(config.bundlerSecret);
}

function readTx(config: DemoServerConfig, func: xdr.HostFunction) {
  // Reads never touch the bundler's sequence: any valid account id will do as source.
  return new TransactionBuilder(new Account(bundler(config).publicKey(), "0"), { fee: "100", networkPassphrase: config.networkPassphrase })
    .addOperation(Operation.invokeHostFunction({ func, auth: [] }))
    .setTimeout(30)
    .build();
}

/** Simulate a read-only call and return its value; any failure is a ChainReadError. */
async function read(config: DemoServerConfig, func: xdr.HostFunction): Promise<{ retval: xdr.ScVal; latestLedger: number }> {
  let sim: rpc.Api.SimulateTransactionResponse;
  try {
    sim = await server(config).simulateTransaction(readTx(config, func));
  } catch (error) {
    throw new ChainReadError(`Soroban RPC unavailable: ${(error as Error).message}`);
  }
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new ChainReadError(`Read failed: ${rpc.Api.isSimulationError(sim) ? sim.error : "no result"}`);
  }
  return { retval: sim.result.retval, latestLedger: sim.latestLedger };
}

function call(contract: string, fn: string, ...args: xdr.ScVal[]): xdr.HostFunction {
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({ contractAddress: new Address(contract).toScAddress(), functionName: fn, args }),
  );
}

/* ---- accounts ----------------------------------------------------------- */

/** latch-playground's deterministic salt: sha256(keyDataHex + "webauthn-v1"). */
export function webauthnSalt(keyDataHex: string): Buffer {
  return createHash("sha256").update(`${keyDataHex}webauthn-v1`).digest();
}

/** AccountInitParams with one WebAuthn signer (latch-playground buildWebauthnAccountInitParams). */
export function accountInitParams(keyDataHex: string): xdr.ScVal {
  const signer = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("key_data"), val: xdr.ScVal.scvBytes(Buffer.from(keyDataHex, "hex")) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("signer_kind"), val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("WebAuthn")]) }),
  ]);
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("account_salt"), val: xdr.ScVal.scvBytes(webauthnSalt(keyDataHex)) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("signers"), val: xdr.ScVal.scvVec([xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("External"), signer])]) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("threshold"), val: xdr.ScVal.scvVoid() }),
  ]);
}

export async function predictAccountAddress(config: DemoServerConfig, keyDataHex: string): Promise<string> {
  const { retval } = await read(config, call(config.factoryAddress, "get_account_address", accountInitParams(keyDataHex)));
  return scValToNative(retval) as string;
}

export async function isDeployed(config: DemoServerConfig, contract: string): Promise<boolean> {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contract).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
  try {
    const { entries } = await server(config).getLedgerEntries(key);
    return entries.length > 0;
  } catch (error) {
    throw new ChainReadError(`Soroban RPC unavailable: ${(error as Error).message}`);
  }
}

/** Deploy the passkey's smart account through the factory, paid by the bundler. Idempotent. */
export async function deployAccount(config: DemoServerConfig, keyDataHex: string): Promise<string> {
  const predicted = await predictAccountAddress(config, keyDataHex);
  if (await isDeployed(config, predicted)) return predicted;

  const rpcServer = server(config);
  const payer = bundler(config);
  const tx = new TransactionBuilder(await rpcServer.getAccount(payer.publicKey()), { fee: FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(new Contract(config.factoryAddress).call("create_account", accountInitParams(keyDataHex)))
    .setTimeout(300)
    .build();
  const sim = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`create_account simulation failed: ${sim.error}`);
  const assembled = rpc.assembleTransaction(tx, sim).build();
  assembled.sign(payer);
  const status = await sendAndWait(config, assembled);
  if (status.status !== "success") throw new Error(`create_account ${status.status} (${status.hash})`);
  return predicted;
}

/* ---- rules, balances, usage --------------------------------------------- */

export interface DemoRule {
  id: number;
  /** "Default", or the contract a CallContract rule covers. */
  contract: string | null;
  signers: { verifier: string; keyDataHex: string }[];
  policies: string[];
}

type NativeRule = {
  id: number;
  context_type: [string, string?];
  signers: [string, string, Buffer?][];
  policies: string[];
};

export async function readRules(config: DemoServerConfig, account: string): Promise<DemoRule[]> {
  const count = Number(scValToNative((await read(config, call(account, "get_context_rules_count"))).retval));
  const rules: DemoRule[] = [];
  // Rule ids start at 0 and the demo never removes rules, so ids 0..count-1 are the rules.
  for (let id = 0; id < count; id++) {
    const rule = scValToNative((await read(config, call(account, "get_context_rule", xdr.ScVal.scvU32(id)))).retval) as NativeRule;
    rules.push({
      id: Number(rule.id),
      contract: rule.context_type[0] === "CallContract" ? (rule.context_type[1] ?? null) : null,
      signers: rule.signers
        .filter((s) => s[0] === "External" && s[2])
        .map((s) => ({ verifier: s[1], keyDataHex: Buffer.from(s[2] as Buffer).toString("hex") })),
      policies: rule.policies,
    });
  }
  return rules;
}

function hasSigner(rule: DemoRule, config: DemoServerConfig, keyDataHex: string) {
  return rule.signers.some((s) => s.verifier === config.webauthnVerifierAddress && s.keyDataHex === keyDataHex.toLowerCase());
}

/** The XLM rule this passkey signs for, if the account has one. */
export function xlmRuleFor(rules: DemoRule[], config: DemoServerConfig, keyDataHex: string): DemoRule | null {
  return rules.find((r) => r.contract === NATIVE_XLM_CONTRACT && hasSigner(r, config, keyDataHex)) ?? null;
}

/** The Default rule this passkey signs for (the one the factory creates). */
export function defaultRuleFor(rules: DemoRule[], config: DemoServerConfig, keyDataHex: string): DemoRule | null {
  return rules.find((r) => r.contract === null && hasSigner(r, config, keyDataHex)) ?? null;
}

export async function readBalance(config: DemoServerConfig, address: string): Promise<bigint> {
  const { retval } = await read(config, nativeBalanceHostFunction(address));
  return parseI128(retval.toXDR("base64"));
}

export interface AccountState {
  deployed: boolean;
  balanceStroops: bigint;
  /** The spending limit, when the XLM rule carries the policy. */
  rule: { id: number; limitStroops: bigint; periodLedgers: number } | null;
  usedStroops: bigint;
}

/** Balance, spending limit and usage. Throws ChainReadError if any part can't be read. */
export async function readAccountState(config: DemoServerConfig, account: string, keyDataHex: string | null): Promise<AccountState> {
  if (!(await isDeployed(config, account))) return { deployed: false, balanceStroops: BigInt(0), rule: null, usedStroops: BigInt(0) };
  const balanceStroops = await readBalance(config, account);
  if (!keyDataHex) return { deployed: true, balanceStroops, rule: null, usedStroops: BigInt(0) };
  const xlmRule = xlmRuleFor(await readRules(config, account), config, keyDataHex);
  if (!xlmRule || !xlmRule.policies.includes(config.policyAddress)) return { deployed: true, balanceStroops, rule: null, usedStroops: BigInt(0) };
  const { retval, latestLedger } = await read(config, spendingDataHostFunction(account, xlmRule.id));
  const data = parseSpendingData(retval.toXDR("base64"), latestLedger);
  return { deployed: true, balanceStroops, rule: { id: xlmRule.id, limitStroops: data.limitStroops, periodLedgers: data.periodLedgers }, usedStroops: data.usedStroops };
}

/* ---- prepare (unsigned) and submit (passkey-signed) ---------------------- */

export interface PreparedTx {
  hostFunctionXdr: string;
  authEntriesXdr: string[];
  smartAccountIndex: number;
  contextRuleIds: number[];
  authDigestHex: string;
}

function countContexts(invocation: xdr.SorobanAuthorizedInvocation): number {
  return 1 + invocation.subInvocations().reduce((n, sub) => n + countContexts(sub), 0);
}

/** SHA-256 of the Soroban authorization preimage (stellar-base authorizeEntry; latch-playground hashSorobanAuthPayload). */
export function sorobanAuthPayloadHash(entry: xdr.SorobanAuthorizationEntry, networkPassphrase: string): Buffer {
  const address = entry.credentials().address();
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(networkPassphrase)),
      nonce: address.nonce(),
      invocation: entry.rootInvocation(),
      signatureExpirationLedger: address.signatureExpirationLedger(),
    }),
  );
  return hash(preimage.toXDR());
}

/** What the passkey signs: sha256(auth payload hash || XDR(Vec<u32> context rule ids)). */
export function authDigest(entry: xdr.SorobanAuthorizationEntry, networkPassphrase: string, contextRuleIds: number[]): Buffer {
  const ids = xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))).toXDR();
  return hash(Buffer.concat([sorobanAuthPayloadHash(entry, networkPassphrase), ids]));
}

async function prepare(config: DemoServerConfig, account: string, func: xdr.HostFunction, ruleId: number): Promise<PreparedTx> {
  const rpcServer = server(config);
  const source = await rpcServer.getAccount(bundler(config).publicKey()).catch((error: Error) => {
    throw new ChainReadError(`Soroban RPC unavailable: ${error.message}`);
  });
  const tx = new TransactionBuilder(source, { fee: FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(Operation.invokeHostFunction({ func, auth: [] }))
    .setTimeout(300)
    .build();
  const sim = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new ChainRejectedError(sim.error, simulationContractError({ error: sim.error, events: sim.events }));
  }
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) throw new ChainReadError("Simulation returned no result");
  const entries = sim.result.auth.map((e) => xdr.SorobanAuthorizationEntry.fromXDR(e.toXDR()));
  for (const entry of entries) {
    if (entry.credentials().switch().name === "sorobanCredentialsAddress") {
      entry.credentials().address().signatureExpirationLedger(sim.latestLedger + AUTH_VALID_LEDGERS);
    }
  }
  const smartAccountIndex = entries.findIndex(
    (e) => e.credentials().switch().name === "sorobanCredentialsAddress" && Address.fromScAddress(e.credentials().address().address()).toString() === account,
  );
  if (smartAccountIndex < 0) throw new Error("The account's authorization entry is missing from the simulation");
  const entry = entries[smartAccountIndex];
  const contextRuleIds = new Array<number>(countContexts(entry.rootInvocation())).fill(ruleId);
  return {
    hostFunctionXdr: func.toXDR("base64"),
    authEntriesXdr: entries.map((e) => e.toXDR("base64")),
    smartAccountIndex,
    contextRuleIds,
    authDigestHex: authDigest(entry, config.networkPassphrase, contextRuleIds).toString("hex"),
  };
}

export class RuleMissingError extends Error {}

/** XLM transfer from the smart account, approved under its XLM (spending-limit) rule. */
export async function prepareSend(config: DemoServerConfig, account: string, keyDataHex: string, to: string, amountStroops: bigint): Promise<PreparedTx> {
  const rule = xlmRuleFor(await readRules(config, account), config, keyDataHex);
  if (!rule || !rule.policies.includes(config.policyAddress)) throw new RuleMissingError("Set the spending limit first");
  const transfer = call(NATIVE_XLM_CONTRACT, "transfer", new Address(account).toScVal(), new Address(to).toScVal(), nativeToScVal(amountStroops, { type: "i128" }));
  return prepare(config, account, transfer, rule.id);
}

/**
 * The spending limit, with the limit and period fixed here (100 XLM / 17,280
 * ledgers), approved under the account's Default rule. Null when it is
 * already installed.
 */
export async function prepareInstallLimit(config: DemoServerConfig, account: string, keyDataHex: string): Promise<PreparedTx | null> {
  const rules = await readRules(config, account);
  const signing = defaultRuleFor(rules, config, keyDataHex);
  if (!signing) throw new RuleMissingError("This passkey isn't a signer on the account");
  const xlm = xlmRuleFor(rules, config, keyDataHex);
  if (xlm?.policies.includes(config.policyAddress)) return null;
  const keyData = Buffer.from(keyDataHex, "hex");
  const func = xlm ? addSpendingPolicyHostFunction(account, xlm.id) : addLimitedXlmRuleHostFunction(account, config.webauthnVerifierAddress, keyData);
  return prepare(config, account, func, signing.id);
}

export interface SubmitStatus {
  hash: string;
  status: "success" | "failed" | "pending";
}

async function sendAndWait(config: DemoServerConfig, signed: ReturnType<TransactionBuilder["build"]>): Promise<SubmitStatus> {
  const rpcServer = server(config);
  const sent = await rpcServer.sendTransaction(signed);
  if (sent.status === "ERROR") throw new Error(`Submission refused: ${sent.errorResult?.toXDR("base64") ?? "unknown"}`);
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const result = await rpcServer.getTransaction(sent.hash).catch(() => null);
    if (!result || result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) continue;
    return { hash: sent.hash, status: result.status === rpc.Api.GetTransactionStatus.SUCCESS ? "success" : "failed" };
  }
  return { hash: sent.hash, status: "pending" };
}

/**
 * Attach the passkey signature (latch-playground submit-webauthn's AuthPayload),
 * check it in enforce mode, then submit with the bundler paying. A rule that
 * refuses (e.g. 3221, over the spending limit) throws ChainRejectedError and
 * nothing is submitted.
 */
export async function submitSigned(config: DemoServerConfig, prepared: PreparedTx, keyDataHex: string, sigData: Uint8Array): Promise<SubmitStatus> {
  const entries = prepared.authEntriesXdr.map((e) => xdr.SorobanAuthorizationEntry.fromXDR(e, "base64"));
  entries[prepared.smartAccountIndex]
    .credentials()
    .address()
    .signature(webAuthnAuthPayload(config.webauthnVerifierAddress, Buffer.from(keyDataHex, "hex"), sigData, prepared.contextRuleIds));

  const rpcServer = server(config);
  const payer = bundler(config);
  const tx = new TransactionBuilder(await rpcServer.getAccount(payer.publicKey()), { fee: FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(Operation.invokeHostFunction({ func: xdr.HostFunction.fromXDR(prepared.hostFunctionXdr, "base64"), auth: entries }))
    .setTimeout(300)
    .build();
  const sim = await rpcServer.simulateTransaction(tx, undefined, "enforce");
  if (rpc.Api.isSimulationError(sim)) {
    throw new ChainRejectedError(sim.error, simulationContractError({ error: sim.error, events: sim.events }));
  }
  const assembled = rpc.assembleTransaction(tx, sim).build();
  assembled.sign(payer);
  return sendAndWait(config, assembled);
}
