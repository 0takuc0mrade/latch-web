import {
  DemoError,
  type AccountState,
  type CreateAccountOptions,
  type DemoAccount,
  type DemoAdapter,
  type FundResult,
  type InstallRuleResult,
  type Receipt,
  type RestoreOptions,
  type SendRequest,
  type SendResult,
  type SpendingRuleParams,
} from "./adapter";
import { DEMO_PERIOD_LEDGERS, DEMO_RECIPIENT_ADDRESS, DEMO_SPENDING_LIMIT_STROOPS, ERROR_SPENDING_LIMIT_EXCEEDED, stroopsToXlm } from "./constants";
import { isPasskeyHost, TESTNET_NETWORK_PASSPHRASE } from "./config";
import { assertDemoBalance } from "./funding";
import {
  b64uDecode,
  b64uEncode,
  contractInstanceLedgerKey,
  credentialIdFromKeyDataHex,
  derToCompactLowS,
  encodeWebAuthnSigData,
  hexDecode,
  hexEncode,
} from "./webauthn-codec";

/**
 * The live adapter, end to end on Stellar testnet:
 * - latch-api: passkey account (registration deploys it), sign in, balances,
 *   build-send / prepare-sign (it builds and simulates), submit-webauthn (its
 *   bundler pays and submits);
 * - the browser: the spending rule (add_context_rule / add_policy, built here),
 *   the passkey signatures, and an enforce-mode simulation of every signed send
 *   against public Soroban RPC, so "Your rule said no" (contract error 3221) is
 *   caught before anything is submitted;
 * - Friendbot directly for test XLM; Soroban RPC for existence checks, the
 *   policy's spending history and receipts.
 *
 * Every latch-api request names `network: "testnet"`, so a mainnet-only
 * deployment refuses it (network_mismatch) instead of acting.
 */

export interface LiveConfig {
  apiUrl: string;
  friendbotUrl: string;
  rpcUrl: string;
  rpId: string;
  explorerTxUrl: string;
  /** latch's NEXT_PUBLIC_NETWORK_PASSPHRASE; anything but testnet's stops the demo (as in latch's demoServer). */
  networkPassphrase?: string;
}

/** What the adapter needs from the browser; injected so tests don't need one. */
export interface LiveEnvironment {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  credentials: Pick<CredentialsContainer, "create" | "get"> | null;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  hostname: string;
  protocol: string;
  sleep: (ms: number) => Promise<void>;
}

/** Account details kept in this browser: the credential and key data are needed to sign. */
export const LIVE_ACCOUNT_KEY = "latch-demo-live-account-v1";

interface StoredAccount {
  address: string;
  credentialId: string;
  keyDataHex: string;
}

interface ApiErrorBody {
  code?: string;
  error?: string;
  message?: string;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

/** build-send / prepare-sign response fields the adapter uses. */
export interface AuthBuild {
  txXdr: string;
  authEntryXdr?: string;
  authEntriesXdr?: string[];
  smartAccountAuthEntryIndex?: number;
  delegatedGAuthEntrySynthesized?: boolean;
  contextRuleId?: number;
  contextRuleIds?: number[];
  authDigestHex: string;
}

interface ContextRule {
  id: number;
  callContractAddress?: string;
  signers: { kind?: string; verifierAddress?: string; keyDataHex?: string }[];
}

interface Simulation {
  error?: string;
  events?: string[];
  results?: { xdr: string }[];
  latestLedger: number;
}

const NETWORK = "testnet";

type SorobanTx = typeof import("./soroban-tx");
let sorobanTxModule: Promise<SorobanTx> | null = null;
/** Loaded on first use so @stellar/stellar-base only ships when live mode runs. */
function sorobanTx(): Promise<SorobanTx> {
  sorobanTxModule ??= import("./soroban-tx");
  return sorobanTxModule;
}

function defaultEnvironment(): LiveEnvironment {
  const hasWindow = typeof window !== "undefined";
  return {
    fetch: (input, init) => fetch(input, init),
    credentials: hasWindow && navigator.credentials ? navigator.credentials : null,
    storage: hasWindow ? window.localStorage : null,
    hostname: hasWindow ? window.location.hostname : "",
    protocol: hasWindow ? window.location.protocol : "",
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** "50" from 500000000 stroops: latch-api takes decimal amounts in asset units. */
function decimalXlm(stroops: bigint): string {
  return stroopsToXlm(stroops).toString();
}

function ruleIdsOf(build: AuthBuild): number[] {
  return build.contextRuleIds?.length ? build.contextRuleIds : [build.contextRuleId ?? 0];
}

export class LiveDemoAdapter implements DemoAdapter {
  readonly mode = "live" as const;
  private readonly env: LiveEnvironment;

  constructor(
    private readonly config: LiveConfig,
    env: Partial<LiveEnvironment> = {},
  ) {
    this.env = { ...defaultEnvironment(), ...env };
  }

  /* ---- DemoAdapter ---------------------------------------------------- */

  async createAccount(options: CreateAccountOptions = {}): Promise<DemoAccount> {
    this.assertPasskeyHost("Nothing was created.");
    const begin = await this.api<{ options: CredentialCreationJSON }>("POST", "/api/webauthn/registration/begin", {
      displayName: "Latch demo",
    }).catch((error: unknown) => {
      throw this.networkError(error, "Nothing was created.");
    });

    const credential = await this.passkey("create", { publicKey: creationOptions(begin.options) }, "Nothing was created.");
    options.onStep?.("passkey");

    let finish: { smartAccountAddress: string; keyDataHex: string; credentialId: string };
    try {
      finish = await this.api("POST", "/api/webauthn/registration/finish", { response: registrationJSON(credential) });
    } catch {
      // The passkey now exists on the device but no account came of it (PR_NOTES.md item 8).
      throw new DemoError(
        "account_deploy_failed",
        "Your account wasn’t created. Your device may keep an unused Latch passkey; nothing else was set up.",
        { nothingHappened: false },
      );
    }
    options.onStep?.("account");

    await this.assertOnTestnet(finish.smartAccountAddress);
    options.onStep?.("signer");

    const account = { address: finish.smartAccountAddress, credentialId: finish.credentialId, keyDataHex: finish.keyDataHex };
    this.saveAccount(account);
    return { address: account.address, credentialId: account.credentialId };
  }

  async restoreSession(options: RestoreOptions = {}): Promise<DemoAccount | null> {
    if (!options.prompt) {
      // Silent: the account this browser knows about, if the session still lists it.
      const stored = this.loadAccount();
      if (!stored) return null;
      const list = await this.api<{ accounts: { smartAccountAddress: string }[] }>("GET", "/api/accounts");
      return list.accounts.some((a) => a.smartAccountAddress === stored.address)
        ? { address: stored.address, credentialId: stored.credentialId }
        : null;
    }

    // Sign in: the passkey ceremony, which also finds accounts made on another device.
    this.assertPasskeyHost("Nothing changed.");
    const begin = await this.api<{ options: CredentialRequestJSON }>("POST", "/api/webauthn/authentication/begin", {}).catch(
      (error: unknown) => {
        throw this.networkError(error, "Nothing changed.");
      },
    );
    const credential = await this.passkey("get", { publicKey: requestOptions(begin.options) }, "Nothing changed.");
    let finish: { smartAccountAddress?: string; keyDataHex?: string; activeCredentialId?: string };
    try {
      finish = await this.api("POST", "/api/webauthn/authentication/finish", { response: assertionJSON(credential) });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 401)) return null;
      throw this.networkError(error, "Nothing changed.");
    }
    if (!finish.smartAccountAddress || !finish.keyDataHex) return null;
    await this.assertOnTestnet(finish.smartAccountAddress);
    const account = {
      address: finish.smartAccountAddress,
      credentialId: finish.activeCredentialId ?? credentialIdFromKeyDataHex(finish.keyDataHex),
      keyDataHex: finish.keyDataHex,
    };
    this.saveAccount(account);
    return { address: account.address, credentialId: account.credentialId };
  }

  async getAccountState(account: DemoAccount): Promise<AccountState> {
    const query = new URLSearchParams({ smartAccountAddress: account.address, network: NETWORK, all: "1" });
    const result = await this.api<{ balances: { assetId: string; balanceRaw: string }[] }>(
      "GET",
      `/api/smart-account/balances?${query}`,
    );
    const native = result.balances.find((b) => b.assetId === "native");
    const balanceStroops = native ? BigInt(native.balanceRaw) : BigInt(0);

    // The rule and its rolling-window usage come from the policy itself, on chain.
    const stored = this.loadAccount();
    const xlmRule = stored ? await this.xlmRule(stored).catch(() => null) : null;
    if (!xlmRule) return { balanceStroops, rule: null, usedStroops: BigInt(0) };
    const tx = await sorobanTx();
    const sim = await this.simulate(tx.invokeTransaction(tx.spendingDataHostFunction(account.address, xlmRule.id), DEMO_RECIPIENT_ADDRESS)).catch(() => null);
    if (!sim || sim.error || !sim.results?.[0]) return { balanceStroops, rule: null, usedStroops: BigInt(0) };
    const data = tx.parseSpendingData(sim.results[0].xdr, sim.latestLedger);
    return {
      balanceStroops,
      rule: { limitStroops: data.limitStroops, periodLedgers: data.periodLedgers },
      usedStroops: data.usedStroops,
    };
  }

  /** Native XLM balance of any G or C address, read from the XLM contract on testnet. */
  async getBalance(address: string): Promise<bigint> {
    const tx = await sorobanTx();
    const sim = await this.simulate(tx.invokeTransaction(tx.nativeBalanceHostFunction(address), DEMO_RECIPIENT_ADDRESS));
    if (sim.error || !sim.results?.[0]) throw new DemoError("network_unavailable", "The network couldn’t read that balance. Refresh to try again.");
    return tx.parseI128(sim.results[0].xdr);
  }

  async fund(account: DemoAccount): Promise<FundResult> {
    // Friendbot funds a C-address directly with 10,000 test XLM and allows browser requests (CORS *).
    let response: Response;
    try {
      response = await this.env.fetch(`${this.config.friendbotUrl}/?addr=${encodeURIComponent(account.address)}`);
    } catch {
      throw new DemoError("funding_failed", "Friendbot couldn’t be reached. Nothing was added. Try again.");
    }
    if (response.status === 429) {
      throw new DemoError("funding_failed", "Friendbot is busy. Wait a minute and try again. Nothing was added.");
    }
    const body = (await response.json().catch(() => ({}))) as { hash?: string; detail?: string };
    const state = await this.getAccountState(account);
    // Friendbot refuses an account it already funded; the balance decides either way.
    if (!response.ok && state.balanceStroops === BigInt(0)) {
      throw new DemoError("funding_failed", "Friendbot didn’t add any test XLM. Nothing was added. Try again.");
    }
    assertDemoBalance(state.balanceStroops);
    return { txHash: body.hash ?? "", balanceStroops: state.balanceStroops };
  }

  /**
   * The spending rule, built in the browser: a CallContract(native XLM) rule
   * signed by this passkey with the spending-limit policy, in one
   * add_context_rule call (or add_policy if the XLM rule already exists).
   * latch-api's prepare-sign returns what the passkey signs; its
   * submit-webauthn submits. Safe to repeat: an installed policy is detected
   * on chain first.
   */
  async installSpendingRule(account: DemoAccount, rule: SpendingRuleParams): Promise<InstallRuleResult> {
    void rule; // the policy's address, limit and period are fixed in soroban-tx.ts on purpose
    const stored = this.requireAccount(account);
    this.assertPasskeyHost("Nothing was changed.");
    const tx = await sorobanTx();

    const rules = await this.rules(stored.address).catch((error: unknown) => {
      throw this.networkError(error, "Nothing was changed.");
    });
    const verifier = this.verifierFor(rules, stored);
    if (!verifier) throw new DemoError("rule_install_failed", "This passkey isn’t a signer on the account. Nothing was changed.");
    const keyData = hexDecode(stored.keyDataHex);
    const existing = rules.find((r) => r.callContractAddress === tx.NATIVE_XLM_CONTRACT && this.hasSigner(r, stored));

    let hostFunction;
    if (existing) {
      const probe = await this.simulate(tx.invokeTransaction(tx.addSpendingPolicyHostFunction(stored.address, existing.id), DEMO_RECIPIENT_ADDRESS)).catch(() => null);
      const code = probe ? tx.simulationContractError(probe) : null;
      if (code === tx.POLICY_DUPLICATE_ON_RULE || code === tx.POLICY_ALREADY_INSTALLED) {
        return { txHash: "", rule: { limitStroops: DEMO_SPENDING_LIMIT_STROOPS, periodLedgers: DEMO_PERIOD_LEDGERS } };
      }
      hostFunction = tx.addSpendingPolicyHostFunction(stored.address, existing.id);
    } else {
      hostFunction = tx.addLimitedXlmRuleHostFunction(stored.address, verifier, keyData);
    }

    const build = await this.api<AuthBuild>("POST", "/api/transaction/prepare-sign", {
      network: NETWORK,
      smartAccountAddress: stored.address,
      unsignedTxXdr: tx.invokeTransaction(hostFunction, DEMO_RECIPIENT_ADDRESS),
      signerType: "passkey",
      keyDataHex: stored.keyDataHex,
    }).catch(() => {
      throw new DemoError("rule_install_failed", "The rule couldn’t be prepared. Nothing was changed.");
    });
    const sigData = await this.signDigest(stored, build.authDigestHex, "Nothing was changed.");
    const check = await this.enforceSimulation(build, sigData, rules, stored);
    if (check.blocked !== null) {
      throw new DemoError("rule_install_failed", "The rule was refused on Stellar. Nothing was changed.");
    }
    const submitted = await this.submit(stored, build, sigData).catch(() => {
      throw new DemoError("rule_install_failed", "The rule wasn’t added. Nothing was changed.");
    });
    await this.settle(submitted);
    this.rulesCache = null;
    return { txHash: submitted.hash, rule: { limitStroops: DEMO_SPENDING_LIMIT_STROOPS, periodLedgers: DEMO_PERIOD_LEDGERS } };
  }

  async send(request: SendRequest): Promise<SendResult> {
    const stored = this.requireAccount(request.account);
    this.assertPasskeyHost("Nothing was sent.");
    const recipientCheck = await sorobanTx();
    if (!recipientCheck.isValidRecipient(request.to)) {
      throw new DemoError("send_failed", "That isn’t a valid Stellar testnet address. Nothing was sent.");
    }

    // latch-api binds an XLM send to the CallContract(native XLM) rule when it lists this passkey.
    const build = await this.api<AuthBuild>("POST", "/api/transaction/build-send", {
      network: NETWORK,
      smartAccountAddress: stored.address,
      signerType: "passkey",
      assetId: "native",
      recipient: request.to,
      amount: decimalXlm(request.amountStroops),
      keyDataHex: stored.keyDataHex,
    }).catch((error: unknown) => {
      throw this.sendError(error);
    });

    const sigData = await this.signDigest(stored, build.authDigestHex, "Nothing was sent.");
    request.onStep?.("signed");

    // Simulate the signed transaction in enforce mode before submitting: the policy runs inside
    // __check_auth, so a send over the limit fails here with 3221 and is never submitted.
    const rules = await this.rules(stored.address).catch(() => [] as ContextRule[]);
    const check = await this.enforceSimulation(build, sigData, rules, stored);
    if (check.blocked === ERROR_SPENDING_LIMIT_EXCEEDED) {
      throw new DemoError("spending_limit_exceeded", "Your rule said no. Nothing was sent.", { contractErrorCode: ERROR_SPENDING_LIMIT_EXCEEDED });
    }
    if (check.blocked !== null) throw new DemoError("send_failed", "The payment wouldn’t go through. Nothing was sent.");
    request.onStep?.("checking");

    // submit-webauthn's generic 400 stays as the plain fallback (e.g. if simulation was unavailable).
    const submitted = await this.submit(stored, build, sigData).catch((error: unknown) => {
      throw this.sendError(error);
    });
    const receipt = await this.settle(submitted);
    if (receipt?.status === "failed") throw new DemoError("send_failed", "The payment failed on Stellar. Nothing was sent.");
    request.onStep?.("recorded");

    const state = await this.getAccountState(request.account);
    return { txHash: submitted.hash, balanceStroops: state.balanceStroops, usedStroops: state.usedStroops };
  }

  async getReceipt(txHash: string): Promise<Receipt> {
    const result = await this.rpc<{ status: string }>("getTransaction", { hash: txHash });
    const status = result.status === "SUCCESS" ? "success" : result.status === "FAILED" ? "failed" : "pending";
    return { txHash, status, explorerUrl: `${this.config.explorerTxUrl}/${txHash}` };
  }

  private warmed = false;

  /**
   * Wake latch-api (Render's free tier sleeps) as soon as the page loads, so
   * it's likely awake by the time the visitor presses Create account. One
   * cheap GET /health; the result is ignored.
   */
  warmUp(): void {
    if (this.warmed) return;
    this.warmed = true;
    this.env.fetch(`${this.config.apiUrl}/health`, { cache: "no-store" }).catch(() => {
      /* Best effort: the real request will wait for the wake-up if this didn't help. */
    });
  }

  async reset(): Promise<void> {
    // The passkey stays on the device; the demo just forgets this account here.
    this.env.storage?.removeItem(LIVE_ACCOUNT_KEY);
    this.rulesCache = null;
  }

  /* ---- helpers -------------------------------------------------------- */

  /** Passkeys for latch-api's RP ID only work over https on that host or a subdomain. */
  private assertPasskeyHost(nothing: string) {
    if (this.config.networkPassphrase && this.config.networkPassphrase !== TESTNET_NETWORK_PASSPHRASE) {
      throw new DemoError("network_unavailable", `This experience requires Stellar testnet. ${nothing}`);
    }
    const rpId = this.config.rpId;
    if (!isPasskeyHost(this.env.hostname, this.env.protocol, rpId)) {
      throw new DemoError("passkey_unsupported", `Passkeys for this demo only work on ${rpId}. ${nothing}`);
    }
    if (!this.env.credentials) {
      throw new DemoError("passkey_unsupported", `This browser doesn’t support passkeys. ${nothing}`);
    }
  }

  private async passkey(kind: "create" | "get", options: CredentialCreationOptions | CredentialRequestOptions, nothing: string) {
    try {
      const credential =
        kind === "create"
          ? await this.env.credentials!.create(options as CredentialCreationOptions)
          : await this.env.credentials!.get(options as CredentialRequestOptions);
      if (!credential) throw new Error("no credential");
      return credential as PublicKeyCredential;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "NotAllowedError" || name === "AbortError") {
        throw new DemoError("passkey_cancelled", `The passkey prompt was closed or timed out. ${nothing}`);
      }
      throw new DemoError("passkey_unsupported", `The passkey couldn’t be used here. ${nothing}`);
    }
  }

  /** The passkey signs latch-api's auth digest; returns WebAuthnSigData XDR. */
  private async signDigest(stored: StoredAccount, authDigestHex: string, nothing: string): Promise<Uint8Array> {
    const assertion = await this.passkey(
      "get",
      {
        publicKey: {
          challenge: hexDecode(authDigestHex),
          rpId: this.config.rpId,
          allowCredentials: [{ id: b64uDecode(stored.credentialId), type: "public-key" }],
          // The on-chain WebAuthn verifier rejects signatures without user verification.
          userVerification: "required",
          timeout: 60_000,
        },
      },
      nothing,
    );
    const response = assertion.response as AuthenticatorAssertionResponse;
    return encodeWebAuthnSigData({
      authenticatorData: new Uint8Array(response.authenticatorData),
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      signature: derToCompactLowS(new Uint8Array(response.signature)),
    });
  }

  /**
   * Attach the passkey's AuthPayload (exactly as latch-api's submit-webauthn
   * would) and simulate in enforce mode. `blocked` is the contract error, or
   * null if the transaction would go through. If simulation itself is
   * unavailable, returns null and leaves the decision to submit-webauthn.
   */
  private async enforceSimulation(build: AuthBuild, sigData: Uint8Array, rules: ContextRule[], stored: StoredAccount): Promise<{ blocked: number | null }> {
    const tx = await sorobanTx();
    const ids = ruleIdsOf(build);
    const rule = rules.find((r) => r.id === ids[0]);
    const verifier = (rule && rule.signers.find((s) => s.keyDataHex === stored.keyDataHex)?.verifierAddress) ?? this.verifierFor(rules, stored);
    if (!verifier) return { blocked: null };
    try {
      const payload = tx.webAuthnAuthPayload(verifier, hexDecode(stored.keyDataHex), sigData, ids);
      const entries = tx.signedAuthEntries(build.authEntriesXdr?.length ? build.authEntriesXdr : [build.authEntryXdr ?? ""], build.smartAccountAuthEntryIndex ?? 0, payload);
      const sim = await this.simulate(tx.invokeTransaction(tx.hostFunctionOf(build.txXdr), DEMO_RECIPIENT_ADDRESS, entries), "enforce");
      return { blocked: sim.error ? (tx.simulationContractError(sim) ?? -1) : null };
    } catch {
      return { blocked: null };
    }
  }

  private submit(stored: StoredAccount, build: AuthBuild, sigData: Uint8Array) {
    return this.api<{ hash: string; status: string }>("POST", "/api/transaction/submit-webauthn", {
      network: NETWORK,
      txXdr: build.txXdr,
      authEntryXdr: build.authEntryXdr,
      authEntriesXdr: build.authEntriesXdr,
      smartAccountAuthEntryIndex: build.smartAccountAuthEntryIndex ?? 0,
      delegatedGAuthEntrySynthesized: build.delegatedGAuthEntrySynthesized ?? false,
      contextRuleId: build.contextRuleId,
      sigDataXdr: hexEncode(sigData),
      keyDataHex: stored.keyDataHex,
    });
  }

  /** Wait for a submitted transaction unless latch-api already reported it settled. */
  private async settle(submitted: { hash: string; status: string }) {
    return submitted.status === "SUCCESS" ? null : this.waitForReceipt(submitted.hash);
  }

  private rulesCache: { address: string; rules: ContextRule[] } | null = null;

  private async rules(address: string): Promise<ContextRule[]> {
    if (this.rulesCache?.address === address) return this.rulesCache.rules;
    const query = new URLSearchParams({ address, network: NETWORK });
    const result = await this.api<{ rules: ContextRule[] }>("GET", `/api/smart-account/context-rules?${query}`);
    this.rulesCache = { address, rules: result.rules };
    return result.rules;
  }

  private async xlmRule(stored: StoredAccount): Promise<ContextRule | null> {
    const tx = await sorobanTx();
    this.rulesCache = null; // rules can change between chapters
    const rules = await this.rules(stored.address);
    return rules.find((r) => r.callContractAddress === tx.NATIVE_XLM_CONTRACT && this.hasSigner(r, stored)) ?? null;
  }

  private hasSigner(rule: ContextRule, stored: StoredAccount) {
    return rule.signers.some((s) => s.keyDataHex === stored.keyDataHex);
  }

  /** The WebAuthn verifier this passkey is registered with, read from the account's own rules. */
  private verifierFor(rules: ContextRule[], stored: StoredAccount): string | undefined {
    return rules.flatMap((r) => r.signers).find((s) => s.keyDataHex === stored.keyDataHex && s.verifierAddress)?.verifierAddress;
  }

  /** latch-api failures on build/submit. 3221 is normally caught earlier by enforce simulation. */
  private sendError(error: unknown): DemoError {
    if (error instanceof DemoError) return error;
    if (error instanceof ApiError) {
      const text = `${error.code ?? ""} ${error.message}`;
      if (text.includes(String(ERROR_SPENDING_LIMIT_EXCEEDED))) {
        return new DemoError("spending_limit_exceeded", "Your rule said no. Nothing was sent.", {
          contractErrorCode: ERROR_SPENDING_LIMIT_EXCEEDED,
        });
      }
      if (error.code === "network_mismatch") {
        return new DemoError("network_unavailable", "The demo’s backend isn’t on testnet. Nothing was sent.");
      }
      return new DemoError("send_failed", "The payment didn’t go through. Nothing was sent.");
    }
    return this.networkError(error, "Nothing was sent.");
  }

  private networkError(error: unknown, nothing: string): DemoError {
    if (error instanceof DemoError) return error;
    if (error instanceof ApiError && error.code === "network_mismatch") {
      return new DemoError("network_unavailable", `The demo’s backend isn’t on testnet. ${nothing}`);
    }
    return new DemoError("network_unavailable", `The demo’s backend couldn’t be reached. ${nothing}`);
  }

  /** The account must exist on Stellar testnet before the demo goes on. */
  private async assertOnTestnet(address: string) {
    const key = contractInstanceLedgerKey(address);
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await this.rpc<{ entries?: unknown[] }>("getLedgerEntries", { keys: [key] }).catch(() => null);
      if (result?.entries && result.entries.length > 0) return;
      await this.env.sleep(1500);
    }
    throw new DemoError(
      "account_deploy_failed",
      "Your account wasn’t found on Stellar testnet, so the demo stopped. Nothing was funded or sent.",
      { nothingHappened: false },
    );
  }

  private async waitForReceipt(hash: string): Promise<Receipt> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const receipt = await this.getReceipt(hash).catch(() => null);
      if (receipt && receipt.status !== "pending") return receipt;
      await this.env.sleep(1500);
    }
    return { txHash: hash, status: "pending", explorerUrl: `${this.config.explorerTxUrl}/${hash}` };
  }

  private simulate(transaction: string, authMode?: "enforce"): Promise<Simulation> {
    return this.rpc<Simulation>("simulateTransaction", authMode ? { transaction, authMode } : { transaction });
  }

  private async api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await this.env.fetch(`${this.config.apiUrl}${path}`, {
      method,
      credentials: "include", // latch-api's session is the `sid` cookie
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
    if (!response.ok) throw new ApiError(response.status, json.code, json.message ?? json.error ?? `HTTP ${response.status}`);
    return json;
  }

  private async rpc<T>(method: string, params: unknown): Promise<T> {
    const response = await this.env.fetch(this.config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await response.json()) as { result?: T; error?: { message?: string } };
    if (!json.result) throw new Error(json.error?.message ?? "RPC error");
    return json.result;
  }

  private loadAccount(): StoredAccount | null {
    try {
      const raw = this.env.storage?.getItem(LIVE_ACCOUNT_KEY);
      const value = raw ? (JSON.parse(raw) as Partial<StoredAccount>) : null;
      return value?.address && value.credentialId && value.keyDataHex ? (value as StoredAccount) : null;
    } catch {
      return null;
    }
  }

  private saveAccount(account: StoredAccount) {
    try {
      this.env.storage?.setItem(LIVE_ACCOUNT_KEY, JSON.stringify(account));
    } catch {
      /* Without storage the visitor signs in again next time. */
    }
  }

  private requireAccount(account: DemoAccount): StoredAccount {
    const stored = this.loadAccount();
    if (!stored || stored.address !== account.address) {
      throw new DemoError("network_unavailable", "Sign in with your passkey first. Nothing was sent.");
    }
    return stored;
  }
}

/* WebAuthn JSON <-> browser objects (latch-api speaks base64url JSON) ----- */

interface CredentialCreationJSON {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { alg: number; type: "public-key" }[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  excludeCredentials?: { id: string; type: "public-key" }[];
}

interface CredentialRequestJSON {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: { id: string; type: "public-key" }[];
}

/**
 * latch-api asks for userVerification "preferred", but the on-chain verifier
 * needs it on every signature. Requiring it here makes an authenticator
 * without user verification fail at create ("Nothing was created") instead of
 * leaving an account whose rule and payments are refused later.
 */
function creationOptions(json: CredentialCreationJSON): PublicKeyCredentialCreationOptions {
  return {
    ...json,
    authenticatorSelection: { ...json.authenticatorSelection, userVerification: "required" },
    challenge: b64uDecode(json.challenge),
    user: { ...json.user, id: b64uDecode(json.user.id) },
    excludeCredentials: json.excludeCredentials?.map((c) => ({ ...c, id: b64uDecode(c.id) })),
  };
}

function requestOptions(json: CredentialRequestJSON): PublicKeyCredentialRequestOptions {
  return {
    ...json,
    userVerification: "required",
    challenge: b64uDecode(json.challenge),
    allowCredentials: json.allowCredentials?.map((c) => ({ ...c, id: b64uDecode(c.id) })),
  };
}

function registrationJSON(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: b64uEncode(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: b64uEncode(new Uint8Array(response.clientDataJSON)),
      attestationObject: b64uEncode(new Uint8Array(response.attestationObject)),
    },
    transports: typeof response.getTransports === "function" ? response.getTransports() : undefined,
  };
}

function assertionJSON(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: b64uEncode(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: b64uEncode(new Uint8Array(response.clientDataJSON)),
      authenticatorData: b64uEncode(new Uint8Array(response.authenticatorData)),
      signature: b64uEncode(new Uint8Array(response.signature)),
    },
  };
}
