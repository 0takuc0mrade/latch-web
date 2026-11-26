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
import { DEMO_PERIOD_LEDGERS, DEMO_SPENDING_LIMIT_STROOPS, ERROR_SPENDING_LIMIT_EXCEEDED, FRIENDBOT_BALANCE_STROOPS } from "./constants";
import { isPasskeyHost } from "./config";
import { assertDemoBalance } from "./funding";
import { b64uDecode, b64uEncode, hexDecode } from "./webauthn-codec";

/**
 * The live adapter, end to end on Stellar testnet, using the demo's own API
 * (app/api/demo/*, latch-playground's plumbing): the server deploys the
 * passkey account, builds every transaction, checks it against the account's
 * rules and submits it with the bundler paying. The browser only runs the
 * passkey ceremonies, signs the digest the server returns, and asks
 * Friendbot for test XLM. The page and the API are one site, so there is no
 * proxy, no cross-site cookie and no session.
 */

export interface LiveConfig {
  /** The demo API base, "/api/demo". */
  apiUrl: string;
  friendbotUrl: string;
  /** Soroban RPC, only for receipts. */
  rpcUrl: string;
  explorerTxUrl: string;
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

/** Account details kept in this browser: the credential and key data are needed to sign. v2: the demo's own backend. */
export const LIVE_ACCOUNT_KEY = "latch-demo-live-account-v2";

interface StoredAccount {
  address: string;
  credentialId: string;
  keyDataHex: string;
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

interface AccountStateJSON {
  deployed: boolean;
  balanceStroops: string;
  rule: { id: number; limitStroops: string; periodLedgers: number } | null;
  usedStroops: string;
}

interface Prepared {
  token: string;
  authDigestHex: string;
}

const LIMIT_RULE: SpendingRuleParams = { limitStroops: DEMO_SPENDING_LIMIT_STROOPS, periodLedgers: DEMO_PERIOD_LEDGERS };

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

/** "Latch demo · 25 Nov, 19:35" in the visitor's locale: the name passkey managers list. */
export function passkeyDisplayName(when: Date): string {
  const stamp = when.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `Latch demo · ${stamp}`;
}

function toState(json: AccountStateJSON): AccountState {
  return {
    balanceStroops: BigInt(json.balanceStroops),
    rule: json.rule ? { limitStroops: BigInt(json.rule.limitStroops), periodLedgers: json.rule.periodLedgers } : null,
    usedStroops: BigInt(json.usedStroops),
  };
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
    const begin = await this.api<{ options: CredentialCreationJSON; token: string }>("POST", "/passkey/register/options", {
      // A timestamp keeps each test account's passkey apart in passkey managers.
      displayName: passkeyDisplayName(new Date()),
    }).catch((error: unknown) => {
      throw this.networkError(error, "Nothing was created.");
    });

    const credential = await this.passkey("create", { publicKey: creationOptions(begin.options) }, "Nothing was created.");
    options.onStep?.("passkey");

    let finish: StoredAccount;
    try {
      finish = await this.api<StoredAccount>("POST", "/passkey/register/verify", { token: begin.token, response: registrationJSON(credential) });
    } catch (error) {
      if (error instanceof ApiError && error.code === "expired") {
        throw new DemoError("account_deploy_failed", "That took too long. Your device may keep an unused Latch demo passkey; nothing else was set up. Try again.", { nothingHappened: false });
      }
      // The passkey now exists on the device; the account may not (PR_NOTES.md item 8).
      throw new DemoError("account_deploy_failed", "Your account wasn’t created. Your device may keep an unused Latch demo passkey; nothing else was set up.", {
        nothingHappened: false,
      });
    }
    // The server deploys the account with this passkey as its signer in one step.
    options.onStep?.("account");
    options.onStep?.("signer");

    this.saveAccount(finish);
    return { address: finish.address, credentialId: finish.credentialId };
  }

  async restoreSession(options: RestoreOptions = {}): Promise<DemoAccount | null> {
    if (!options.prompt) {
      // Silent: the account this browser knows about, if it is on testnet.
      const stored = this.loadAccount();
      if (!stored) return null;
      const state = await this.api<AccountStateJSON>("GET", `/account?${new URLSearchParams({ address: stored.address })}`);
      return state.deployed ? { address: stored.address, credentialId: stored.credentialId } : null;
    }

    // Sign in: the passkey ceremony, which also finds accounts made on another device.
    this.assertPasskeyHost("Nothing changed.");
    const begin = await this.api<{ options: CredentialRequestJSON; token: string }>("POST", "/passkey/signin/options", {}).catch((error: unknown) => {
      throw this.networkError(error, "Nothing changed.");
    });
    const credential = await this.passkey("get", { publicKey: requestOptions(begin.options) }, "Nothing changed.");
    let found: StoredAccount;
    try {
      found = await this.api<StoredAccount>("POST", "/passkey/signin/verify", { token: begin.token, response: assertionJSON(credential) });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw this.networkError(error, "Nothing changed.");
    }
    this.saveAccount(found);
    return { address: found.address, credentialId: found.credentialId };
  }

  /** Throws (never "no rule") when the network can't be read, so the page keeps showing "—". */
  async getAccountState(account: DemoAccount): Promise<AccountState> {
    const stored = this.loadAccount();
    const query = new URLSearchParams({ address: account.address });
    if (stored?.address === account.address) query.set("keyDataHex", stored.keyDataHex);
    const json = await this.api<AccountStateJSON>("GET", `/account?${query}`).catch((error: unknown) => {
      throw this.networkError(error, "Nothing changed.");
    });
    return toState(json);
  }

  /** Native XLM balance of any G or C address on testnet. */
  async getBalance(address: string): Promise<bigint> {
    const json = await this.api<{ balanceStroops: string }>("GET", `/balance?${new URLSearchParams({ address })}`).catch(() => {
      throw new DemoError("network_unavailable", "The network couldn’t read that balance. Refresh to try again.");
    });
    return BigInt(json.balanceStroops);
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
    const body = (await response.json().catch(() => ({}))) as { hash?: string };

    // The balance decides (Friendbot refuses an account it already funded). A read that fails
    // after Friendbot said yes must not turn a funded account into an error.
    let balance: bigint | null = null;
    for (let attempt = 0; attempt < 3 && balance === null; attempt++) {
      if (attempt > 0) await this.env.sleep(1500);
      balance = await this.getAccountState(account).then((s) => s.balanceStroops, () => null);
    }
    if (balance === null) {
      if (!response.ok) throw new DemoError("funding_failed", "We couldn’t confirm any test XLM. Refresh your balance, or try again.");
      balance = FRIENDBOT_BALANCE_STROOPS;
    }
    if (!response.ok && balance === BigInt(0)) {
      throw new DemoError("funding_failed", "Friendbot didn’t add any test XLM. Nothing was added. Try again.");
    }
    assertDemoBalance(balance);
    return { txHash: body.hash ?? "", balanceStroops: balance };
  }

  /**
   * The spending limit (100 XLM / 24h on an XLM rule), built on the server
   * with the values fixed there, signed by the passkey. Safe to repeat: the
   * server answers "installed" when it's already on chain.
   */
  async installSpendingRule(account: DemoAccount, rule?: SpendingRuleParams): Promise<InstallRuleResult> {
    void rule; // the limit and period are fixed on the server on purpose
    const stored = this.requireAccount(account, "Nothing was changed.");
    this.assertPasskeyHost("Nothing was changed.");

    const prepared = await this.api<Prepared | { installed: true }>("POST", "/prepare", {
      action: "install-limit",
      address: stored.address,
      keyDataHex: stored.keyDataHex,
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.code === "network_unavailable") throw this.networkError(error, "Nothing was changed.");
      throw new DemoError("rule_install_failed", "The spending limit couldn’t be prepared. Nothing was changed.");
    });
    if ("installed" in prepared) return { txHash: "", rule: LIMIT_RULE };

    const assertion = await this.signDigest(stored, prepared.authDigestHex, "Nothing was changed.");
    const submitted = await this.api<{ hash: string; status: "success" | "failed" | "pending" }>("POST", "/submit", { token: prepared.token, assertion }).catch(
      (error: unknown) => {
        if (error instanceof ApiError && error.status === 422) throw new DemoError("rule_install_failed", "Your account refused the change. Nothing was changed.");
        throw this.networkError(error, "Nothing was changed.");
      },
    );
    if (submitted.status === "failed") throw new DemoError("rule_install_failed", "The spending limit failed on Stellar. Nothing was changed.");
    if (submitted.status === "pending" && !(await this.limitConfirmed(account))) {
      throw new DemoError("rule_install_failed", "Stellar hasn’t confirmed the spending limit yet. Refresh in a minute to check.", { nothingHappened: false });
    }
    return { txHash: submitted.hash, rule: LIMIT_RULE };
  }

  async send(request: SendRequest): Promise<SendResult> {
    const stored = this.requireAccount(request.account, "Nothing was sent.");
    this.assertPasskeyHost("Nothing was sent.");

    const prepared = await this.api<Prepared>("POST", "/prepare", {
      action: "send",
      address: stored.address,
      keyDataHex: stored.keyDataHex,
      to: request.to,
      amountStroops: request.amountStroops.toString(),
    }).catch((error: unknown) => {
      throw this.prepareSendError(error);
    });

    const assertion = await this.signDigest(stored, prepared.authDigestHex, "Nothing was sent.");
    request.onStep?.("signed");
    // The server now checks the signed payment against the account's rules before submitting.
    request.onStep?.("checking");

    const submitted = await this.api<{ hash: string; status: "success" | "failed" | "pending" }>("POST", "/submit", { token: prepared.token, assertion }).catch(
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "spending_limit_exceeded") {
          throw new DemoError("spending_limit_exceeded", "Your rule said no. Nothing was sent.", { contractErrorCode: ERROR_SPENDING_LIMIT_EXCEEDED });
        }
        if (error instanceof ApiError && error.status === 422) throw new DemoError("send_failed", "The payment wouldn’t go through. Nothing was sent.");
        if (error instanceof ApiError && error.code === "expired") throw new DemoError("send_failed", "That took too long. Nothing was sent. Try again.");
        throw this.networkError(error, "Nothing was sent.");
      },
    );
    if (submitted.status === "failed") throw new DemoError("send_failed", "The payment failed on Stellar. Nothing was sent.");
    if (submitted.status === "success") request.onStep?.("recorded");

    // The payment is done; a balance read that fails now must not report it as failed.
    const state = await this.getAccountState(request.account).catch(() => null);
    return {
      txHash: submitted.hash,
      status: submitted.status,
      balanceStroops: state?.balanceStroops ?? null,
      usedStroops: state?.usedStroops ?? null,
    };
  }

  async getReceipt(txHash: string): Promise<Receipt> {
    const response = await this.env.fetch(this.config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: { hash: txHash } }),
    });
    const json = (await response.json()) as { result?: { status: string } };
    const status = json.result?.status === "SUCCESS" ? "success" : json.result?.status === "FAILED" ? "failed" : "pending";
    return { txHash, status, explorerUrl: `${this.config.explorerTxUrl}/${txHash}` };
  }

  async reset(): Promise<void> {
    // The passkey stays on the device; the demo just forgets this account here.
    this.env.storage?.removeItem(LIVE_ACCOUNT_KEY);
  }

  /* ---- helpers -------------------------------------------------------- */

  private assertPasskeyHost(nothing: string) {
    if (!isPasskeyHost(this.env.hostname, this.env.protocol)) {
      throw new DemoError("passkey_unsupported", `Passkeys for this demo don’t work on this page. ${nothing}`);
    }
    if (!this.env.credentials) {
      throw new DemoError("passkey_unsupported", `This browser doesn’t support passkeys. ${nothing}`);
    }
  }

  /** After a submit that wasn't confirmed in time: is the limit on chain now? */
  private async limitConfirmed(account: DemoAccount): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.env.sleep(3000);
      const state = await this.getAccountState(account).catch(() => null);
      if (state?.rule) return true;
    }
    return false;
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
      if (kind === "create" && name === "InvalidStateError") {
        throw new DemoError("passkey_exists", `Your device didn’t make a new passkey. Try again, or sign in with the one you have. ${nothing}`);
      }
      if (name === "NotAllowedError" || name === "AbortError") {
        throw new DemoError("passkey_cancelled", `The passkey prompt was closed or timed out. ${nothing}`);
      }
      // Dev server only: name the browser's own error to diagnose.
      const detail = process.env.NODE_ENV === "development" && name ? ` (${name}: ${(error as Error).message ?? ""})` : "";
      if (detail) console.warn("[demo] passkey", kind, "failed", error);
      throw new DemoError("passkey_unsupported", `The passkey couldn’t be used here.${detail} ${nothing}`);
    }
  }

  /** The passkey signs the server's auth digest; the server turns the assertion into WebAuthnSigData. */
  private async signDigest(stored: StoredAccount, authDigestHex: string, nothing: string) {
    const assertion = await this.passkey(
      "get",
      {
        publicKey: {
          challenge: hexDecode(authDigestHex),
          allowCredentials: [{ id: b64uDecode(stored.credentialId), type: "public-key" }],
          // The on-chain WebAuthn verifier rejects signatures without user verification.
          userVerification: "required",
          timeout: 60_000,
        },
      },
      nothing,
    );
    const response = assertion.response as AuthenticatorAssertionResponse;
    return {
      authenticatorData: b64uEncode(new Uint8Array(response.authenticatorData)),
      clientDataJSON: b64uEncode(new Uint8Array(response.clientDataJSON)),
      signature: b64uEncode(new Uint8Array(response.signature)),
    };
  }

  private prepareSendError(error: unknown): DemoError {
    if (error instanceof ApiError) {
      if (error.code === "rule_missing") return new DemoError("send_failed", "Set your spending limit first. Nothing was sent.");
      if (error.code === "bad_request") return new DemoError("send_failed", "That isn’t a valid Stellar testnet address or amount. Nothing was sent.");
      if (error.status === 422) return new DemoError("send_failed", "The payment wouldn’t go through. Nothing was sent.");
    }
    return this.networkError(error, "Nothing was sent.");
  }

  private networkError(error: unknown, nothing: string): DemoError {
    if (error instanceof DemoError) return error;
    if (error instanceof ApiError && error.code === "wrong_host") {
      return new DemoError("passkey_unsupported", `Passkeys for this demo don’t work on this page. ${nothing}`);
    }
    if (error instanceof ApiError && error.code === "network_unavailable") {
      return new DemoError("network_unavailable", `Stellar testnet couldn’t be reached. ${nothing}`);
    }
    return new DemoError("network_unavailable", `The demo’s server couldn’t be reached. ${nothing}`);
  }

  private async api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await this.env.fetch(`${this.config.apiUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await response.json().catch(() => ({}))) as T & { code?: string; message?: string };
    if (!response.ok) throw new ApiError(response.status, json.code, json.message ?? `HTTP ${response.status}`);
    return json;
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
      this.env.storage?.setItem(LIVE_ACCOUNT_KEY, JSON.stringify({ address: account.address, credentialId: account.credentialId, keyDataHex: account.keyDataHex }));
    } catch {
      /* Without storage the visitor signs in again next time. */
    }
  }

  private requireAccount(account: DemoAccount, nothing: string): StoredAccount {
    const stored = this.loadAccount();
    if (!stored || stored.address !== account.address) {
      throw new DemoError("network_unavailable", `Sign in with your passkey first. ${nothing}`);
    }
    return stored;
  }
}

/* WebAuthn JSON <-> browser objects (@simplewebauthn's base64url JSON) ---- */

interface CredentialCreationJSON {
  challenge: string;
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { alg: number; type: "public-key" }[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  excludeCredentials?: { id: string; type: "public-key"; transports?: AuthenticatorTransport[] }[];
}

interface CredentialRequestJSON {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: { id: string; type: "public-key"; transports?: AuthenticatorTransport[] }[];
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
  const transports = typeof response.getTransports === "function" ? response.getTransports() : [];
  return {
    id: credential.id,
    rawId: b64uEncode(new Uint8Array(credential.rawId)),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: b64uEncode(new Uint8Array(response.clientDataJSON)),
      attestationObject: b64uEncode(new Uint8Array(response.attestationObject)),
      transports,
    },
  };
}

function assertionJSON(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: b64uEncode(new Uint8Array(credential.rawId)),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: b64uEncode(new Uint8Array(response.clientDataJSON)),
      authenticatorData: b64uEncode(new Uint8Array(response.authenticatorData)),
      signature: b64uEncode(new Uint8Array(response.signature)),
      userHandle: response.userHandle ? b64uEncode(new Uint8Array(response.userHandle)) : undefined,
    },
  };
}
