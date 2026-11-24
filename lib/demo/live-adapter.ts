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
import { ERROR_SPENDING_LIMIT_EXCEEDED, stroopsToXlm } from "./constants";
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
 * The live adapter: latch-api (passkey account, sends) + the older demo app's
 * /api/demo/fund (Friendbot) + Soroban testnet RPC (existence checks and
 * receipts). Every latch-api request names `network: "testnet"`, so a
 * mainnet-only deployment refuses it (network_mismatch) instead of acting.
 *
 * Blocked pieces fail honestly, saying nothing happened (PR_NOTES.md):
 * the spending rule (no policy-install route yet), and anything cross-origin
 * until latch-api allow-lists https://uselatch.app with credentials.
 */

export interface LiveConfig {
  apiUrl: string;
  fundUrl: string;
  rpcUrl: string;
  rpId: string;
  explorerTxUrl: string;
}

/** What the adapter needs from the browser; injected so tests don't need one. */
export interface LiveEnvironment {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  credentials: Pick<CredentialsContainer, "create" | "get"> | null;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  hostname: string;
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

/** build-send / setup-send-rules response fields the adapter uses. */
interface AuthBuild {
  txXdr: string;
  authEntryXdr?: string;
  authEntriesXdr?: string[];
  smartAccountAuthEntryIndex?: number;
  delegatedGAuthEntrySynthesized?: boolean;
  contextRuleId?: number;
  authDigestHex: string;
  alreadyConfigured?: boolean;
  remainingSetupCount?: number;
}

const NETWORK = "testnet";

function defaultEnvironment(): LiveEnvironment {
  const hasWindow = typeof window !== "undefined";
  return {
    fetch: (input, init) => fetch(input, init),
    credentials: hasWindow && navigator.credentials ? navigator.credentials : null,
    storage: hasWindow ? window.localStorage : null,
    hostname: hasWindow ? window.location.hostname : "",
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** "50" from 500000000 stroops: latch-api takes decimal amounts in asset units. */
function decimalXlm(stroops: bigint): string {
  return stroopsToXlm(stroops).toString();
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
    // No policy can be installed yet (item 1), so there is no rule or usage to read.
    return { balanceStroops: native ? BigInt(native.balanceRaw) : BigInt(0), rule: null, usedStroops: BigInt(0) };
  }

  async fund(account: DemoAccount): Promise<FundResult> {
    if (!this.config.fundUrl) {
      throw new DemoError("funding_failed", "Test funding isn’t connected to the live demo yet. Nothing was added.");
    }
    let response: Response;
    try {
      response = await this.env.fetch(`${this.config.fundUrl}/api/demo/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Direct Friendbot only: the bridge fallback sends 10 XLM, too little for the demo (item 12).
        body: JSON.stringify({ address: account.address }),
      });
    } catch {
      throw new DemoError("funding_failed", "Friendbot couldn’t be reached. Nothing was added. Try again.");
    }
    const body = (await response.json().catch(() => ({}))) as { hash?: string; error?: string };
    if (response.status === 429) {
      throw new DemoError("funding_failed", "Friendbot is busy. Wait a minute and try again. Nothing was added.");
    }
    if (!response.ok) {
      throw new DemoError("funding_failed", `${body.error ?? "Funding didn’t go through."} Nothing was added.`);
    }
    const state = await this.getAccountState(account);
    assertDemoBalance(state.balanceStroops);
    return { txHash: body.hash ?? "", balanceStroops: state.balanceStroops };
  }

  async installSpendingRule(account: DemoAccount, rule: SpendingRuleParams): Promise<InstallRuleResult> {
    void account;
    void rule;
    // Blocked on the latch-api policy-install route (PR_NOTES.md item 1). Fail before
    // any prompt, so a later send can never look like it was protected by a rule.
    throw new DemoError(
      "rule_install_failed",
      "Spending rules aren’t connected to the live demo yet. Nothing was changed.",
    );
  }

  async send(request: SendRequest): Promise<SendResult> {
    const stored = this.requireAccount(request.account);
    this.assertPasskeyHost("Nothing was sent.");

    // One-time permission for XLM transfers (a CallContract rule on the native SAC).
    const setup = await this.api<AuthBuild>("POST", "/api/smart-account/setup-send-rules", {
      network: NETWORK,
      smartAccountAddress: stored.address,
      signerType: "passkey",
      assetId: "native",
      keyDataHex: stored.keyDataHex,
    }).catch((error: unknown) => {
      throw this.networkError(error, "Nothing was sent.");
    });
    if (!setup.alreadyConfigured) await this.signAndSubmit(stored, setup, "Nothing was sent.");

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

    const submitted = await this.signAndSubmit(stored, build, "Nothing was sent.", () => request.onStep?.("signed"));
    request.onStep?.("checking");
    const receipt = submitted.status === "SUCCESS" ? null : await this.waitForReceipt(submitted.hash);
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

  async reset(): Promise<void> {
    // The passkey stays on the device; the demo just forgets this account here.
    this.env.storage?.removeItem(LIVE_ACCOUNT_KEY);
  }

  /* ---- helpers -------------------------------------------------------- */

  private assertPasskeyHost(nothing: string) {
    const host = this.env.hostname;
    const rpId = this.config.rpId;
    if (host !== rpId && !host.endsWith(`.${rpId}`)) {
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

  /** Sign a built transaction's auth digest with the passkey and submit it through latch-api. */
  private async signAndSubmit(stored: StoredAccount, build: AuthBuild, nothing: string, onSigned?: () => void) {
    const assertion = await this.passkey(
      "get",
      {
        publicKey: {
          challenge: hexDecode(build.authDigestHex),
          rpId: this.config.rpId,
          allowCredentials: [{ id: b64uDecode(stored.credentialId), type: "public-key" }],
          userVerification: "preferred",
          timeout: 60_000,
        },
      },
      nothing,
    );
    onSigned?.();
    const response = assertion.response as AuthenticatorAssertionResponse;
    const sigData = encodeWebAuthnSigData({
      authenticatorData: new Uint8Array(response.authenticatorData),
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      signature: derToCompactLowS(new Uint8Array(response.signature)),
    });
    try {
      return await this.api<{ hash: string; status: string }>("POST", "/api/transaction/submit-webauthn", {
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
    } catch (error) {
      throw this.sendError(error);
    }
  }

  /**
   * Map latch-api failures. Today submit-webauthn hides the contract error
   * behind a generic 400 (item 11); once it returns the code, 3221 becomes
   * "Your rule said no".
   */
  private sendError(error: unknown): DemoError {
    if (error instanceof ApiError) {
      const text = `${error.code ?? ""} ${error.message}`;
      if (text.includes(String(ERROR_SPENDING_LIMIT_EXCEEDED)) || /spending.?limit/i.test(text)) {
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

function creationOptions(json: CredentialCreationJSON): PublicKeyCredentialCreationOptions {
  return {
    ...json,
    challenge: b64uDecode(json.challenge),
    user: { ...json.user, id: b64uDecode(json.user.id) },
    excludeCredentials: json.excludeCredentials?.map((c) => ({ ...c, id: b64uDecode(c.id) })),
  };
}

function requestOptions(json: CredentialRequestJSON): PublicKeyCredentialRequestOptions {
  return {
    ...json,
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
