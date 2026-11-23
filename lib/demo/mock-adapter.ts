import {
  DemoError,
  type CreateAccountOptions,
  type DemoAccount,
  type DemoAdapter,
  type FundResult,
  type InstallRuleResult,
  type Receipt,
  type SendRequest,
  type SendResult,
  type SpendingRuleParams,
} from "./adapter";
import { ERROR_SPENDING_LIMIT_EXCEEDED, FRIENDBOT_BALANCE_STROOPS } from "./constants";
import { assertDemoBalance } from "./funding";

/** localStorage key for the mock "session" (stands in for latch-api's cookie). */
export const MOCK_SESSION_KEY = "latch-demo-mock-session-v1";

const ZERO = BigInt(0);
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MOCK_EXPLORER = "https://stellar.expert/explorer/testnet/tx";

export interface MockTimings {
  /** Multiplier on every delay: 0 for tests, 1 for the realistic feel. */
  scale: number;
}

const wait = (ms: number, scale: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.round(ms * scale)));

function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function mockAddress(): string {
  return `C${randomString(BASE32, 55)}`;
}

function mockTxHash(): string {
  return randomString("0123456789abcdef", 64);
}

function readSession(): DemoAccount | null {
  try {
    const raw = window.localStorage.getItem(MOCK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoAccount>;
    return typeof parsed.address === "string" && typeof parsed.credentialId === "string"
      ? { address: parsed.address, credentialId: parsed.credentialId }
      : null;
  } catch {
    return null;
  }
}

function writeSession(account: DemoAccount | null) {
  try {
    if (account) window.localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(account));
    else window.localStorage.removeItem(MOCK_SESSION_KEY);
  } catch {
    /* Storage is optional. */
  }
}

/**
 * In-memory fake of the chain, shaped like the real flow:
 * Friendbot gives 10,000 test XLM; a 50 XLM send succeeds; a send that would
 * push the rolling total over the installed rule fails with contract error 3221.
 * State lives only in this instance (a reload gives a fresh chain), except the
 * account itself, which is remembered via `MOCK_SESSION_KEY`.
 */
export class MockDemoAdapter implements DemoAdapter {
  readonly mode = "mock" as const;

  private readonly scale: number;
  private balance = ZERO;
  private used = ZERO;
  private rule: SpendingRuleParams | null = null;
  private readonly receipts = new Map<string, Receipt>();

  constructor(timings: MockTimings = { scale: 1 }) {
    this.scale = timings.scale;
  }

  async createAccount(options: CreateAccountOptions = {}): Promise<DemoAccount> {
    // Passkey ceremony (the browser prompt), then deploy, then add signer.
    await wait(900, this.scale);
    // QA hook: open /demo?mock=fail-create to see the "passkey cancelled" error card.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mock") === "fail-create") {
      throw new DemoError("passkey_cancelled", "The passkey prompt was closed. Nothing was created.");
    }
    options.onStep?.("passkey");
    await wait(1500, this.scale);
    options.onStep?.("account");
    await wait(1100, this.scale);
    options.onStep?.("signer");
    await wait(500, this.scale);

    const account: DemoAccount = {
      address: mockAddress(),
      credentialId: randomString("abcdef0123456789", 32),
    };
    this.balance = ZERO;
    this.used = ZERO;
    this.rule = null;
    writeSession(account);
    return account;
  }

  async restoreSession(): Promise<DemoAccount | null> {
    await wait(250, this.scale);
    return readSession();
  }

  async fund(account: DemoAccount): Promise<FundResult> {
    void account;
    await wait(2200, this.scale); // Friendbot + confirmation
    this.balance = FRIENDBOT_BALANCE_STROOPS;
    assertDemoBalance(this.balance);
    return this.settle(this.balance);
  }

  async installSpendingRule(
    account: DemoAccount,
    rule: SpendingRuleParams,
  ): Promise<InstallRuleResult> {
    void account;
    await wait(1800, this.scale); // passkey prompt + add_policy tx
    this.rule = rule;
    this.used = ZERO;
    const txHash = mockTxHash();
    this.record(txHash, "success");
    return { txHash, rule };
  }

  async send(request: SendRequest): Promise<SendResult> {
    await wait(1600, this.scale); // passkey prompt, simulate, submit
    if (request.amountStroops > this.balance) {
      throw new DemoError("send_failed", "Not enough test XLM. Nothing was sent.");
    }
    if (this.rule && this.used + request.amountStroops > this.rule.limitStroops) {
      throw new DemoError(
        "spending_limit_exceeded",
        "Your rule said no. Nothing was sent.",
        { contractErrorCode: ERROR_SPENDING_LIMIT_EXCEEDED },
      );
    }
    this.balance -= request.amountStroops;
    this.used += request.amountStroops;
    const txHash = mockTxHash();
    this.record(txHash, "success");
    return { txHash, balanceStroops: this.balance, usedStroops: this.used };
  }

  async getReceipt(txHash: string): Promise<Receipt> {
    await wait(300, this.scale);
    const receipt = this.receipts.get(txHash);
    if (!receipt) throw new DemoError("network_unavailable", "That transaction was not found.");
    return receipt;
  }

  async reset(): Promise<void> {
    this.balance = ZERO;
    this.used = ZERO;
    this.rule = null;
    this.receipts.clear();
    writeSession(null);
  }

  private settle(balanceStroops: bigint): FundResult {
    const txHash = mockTxHash();
    this.record(txHash, "success");
    return { txHash, balanceStroops };
  }

  private record(txHash: string, status: Receipt["status"]) {
    this.receipts.set(txHash, { txHash, status, explorerUrl: `${MOCK_EXPLORER}/${txHash}` });
  }
}
