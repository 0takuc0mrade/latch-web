/**
 * The seam between the /demo UI and whatever actually talks to Stellar.
 * The UI only ever sees this interface: `live-adapter.ts` (latch-api +
 * Friendbot + Soroban RPC) by default, `mock-adapter.ts` when opted in.
 */

export type DemoAdapterMode = "mock" | "live";

export interface DemoAccount {
  /** Full Soroban smart-account contract address (C…). */
  address: string;
  /** Opaque id of the passkey that approves actions for this account. */
  credentialId: string;
}

/** Steps shown while an account is created, in order. */
export type CreateStep = "passkey" | "account" | "signer";

export interface RestoreOptions {
  /** Ask for the passkey (Sign in) instead of only checking the current session. */
  prompt?: boolean;
}

export interface CreateAccountOptions {
  onStep?: (step: CreateStep) => void;
}

export interface FundResult {
  txHash: string;
  balanceStroops: bigint;
}

export interface SpendingRuleParams {
  limitStroops: bigint;
  periodLedgers: number;
}

export interface InstallRuleResult {
  txHash: string;
  rule: SpendingRuleParams;
}

/** Signing steps shown while a payment is approved, in order. */
export type SendStep = "signed" | "checking" | "recorded";

export interface SendRequest {
  account: DemoAccount;
  /** Destination address (the Latch demo account, or a pasted address). */
  to: string;
  amountStroops: bigint;
  /** Called as each step finishes: device signed, account checking, Stellar recorded. */
  onStep?: (step: SendStep) => void;
}

/** What the page shows about the account: balance, rule, and usage in the rule window. */
export interface AccountState {
  balanceStroops: bigint;
  rule: SpendingRuleParams | null;
  /** Sent inside the rule's rolling window (0 when there is no rule). */
  usedStroops: bigint;
}

export interface SendResult {
  txHash: string;
  /** Balance after the send, fees ignored in the mock. */
  balanceStroops: bigint;
  /** Total sent inside the rolling rule window, including this send. */
  usedStroops: bigint;
}

export interface Receipt {
  txHash: string;
  status: "pending" | "success" | "failed";
  explorerUrl: string;
}

export type DemoErrorCode =
  /** The passkey prompt was closed/timed out, or the browser lacks passkeys. */
  | "passkey_cancelled"
  | "passkey_unsupported"
  /** Account deployment failed after the passkey existed (orphan passkey). */
  | "account_deploy_failed"
  | "funding_failed"
  | "rule_install_failed"
  /** The account's spending rule rejected the payment (contract error 3221). */
  | "spending_limit_exceeded"
  | "send_failed"
  | "network_unavailable";

/**
 * Errors always say what did NOT happen (design content rule): `nothingHappened`
 * is true when no state changed, so the UI can show "Nothing was sent".
 */
export class DemoError extends Error {
  readonly code: DemoErrorCode;
  readonly contractErrorCode?: number;
  readonly nothingHappened: boolean;

  constructor(
    code: DemoErrorCode,
    message: string,
    options: { contractErrorCode?: number; nothingHappened?: boolean } = {},
  ) {
    super(message);
    this.name = "DemoError";
    this.code = code;
    this.contractErrorCode = options.contractErrorCode;
    this.nothingHappened = options.nothingHappened ?? true;
  }
}

export function isDemoError(error: unknown): error is DemoError {
  return error instanceof DemoError;
}

export interface DemoAdapter {
  readonly mode: DemoAdapterMode;
  /** Create a passkey, deploy the smart account, add the passkey as signer. */
  createAccount(options?: CreateAccountOptions): Promise<DemoAccount>;
  /**
   * Existing account, or null. Without options it is a silent check (the
   * session on this device). With `{ prompt: true }` it is "Sign in": the
   * passkey ceremony, which also finds an account created on another device.
   */
  restoreSession(options?: RestoreOptions): Promise<DemoAccount | null>;
  /** Balance, installed rule and rolling-window usage (drives "Refresh balance" and returning visits). */
  getAccountState(account: DemoAccount): Promise<AccountState>;
  /** Native XLM balance of any G or C address (the payment recipient's, in 03 Try it). */
  getBalance(address: string): Promise<bigint>;
  /** Friendbot funding for the account. */
  fund(account: DemoAccount): Promise<FundResult>;
  /** Attach the spending-limit policy to the account's send rule (passkey-signed). */
  installSpendingRule(account: DemoAccount, rule: SpendingRuleParams): Promise<InstallRuleResult>;
  /** Passkey-approved payment. Rejects with `spending_limit_exceeded` over the rule. */
  send(request: SendRequest): Promise<SendResult>;
  getReceipt(txHash: string): Promise<Receipt>;
  /** Forget the account and all local demo state. */
  reset(): Promise<void>;
  /** Optional: wake the backend (e.g. a sleeping Render instance) without waiting. */
  warmUp?(): void;
}
