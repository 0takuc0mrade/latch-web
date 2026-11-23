import {
  DemoError,
  type AccountState,
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
import {
  DEMO_PERIOD_LEDGERS,
  DEMO_SPENDING_LIMIT_STROOPS,
  ERROR_SPENDING_LIMIT_EXCEEDED,
  FRIENDBOT_BALANCE_STROOPS,
  xlmToStroops,
} from "./constants";
import { assertDemoBalance } from "./funding";
import type { DemoStep } from "./progress";

/** localStorage key for the mock's fake chain (stands in for latch-api + the ledger). */
export const MOCK_STATE_KEY = "latch-demo-mock-state-v1";

const ZERO = BigInt(0);
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MOCK_EXPLORER = "https://stellar.expert/explorer/testnet/tx";

export interface MockTimings {
  /** Multiplier on every delay: 0 for tests, 1 for the realistic feel. */
  scale: number;
}

interface MockChain {
  account: DemoAccount;
  balance: bigint;
  used: bigint;
  rule: SpendingRuleParams | null;
}

/**
 * QA hooks, e.g. `/demo?mock=fail-fund,cancel-send`:
 * fail-create, fail-fund, cancel-rule, cancel-send.
 */
type MockFlag = "fail-create" | "fail-fund" | "cancel-rule" | "cancel-send";

function mockFlag(flag: MockFlag): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  const raw = new URLSearchParams(window.location.search).get("mock") ?? "";
  return raw.split(",").includes(flag);
}

const wait = (ms: number, scale: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.round(ms * scale)));

function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function mockAddress(): string {
  return `C${randomString(BASE32, 55)}`;
}

function mockTxHash(): string {
  return randomString("0123456789abcdef", 64);
}

function readChain(): MockChain | null {
  try {
    const raw = window.localStorage.getItem(MOCK_STATE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as {
      address?: unknown;
      credentialId?: unknown;
      balance?: unknown;
      used?: unknown;
      rule?: { limit?: unknown; period?: unknown } | null;
    };
    if (typeof v.address !== "string" || typeof v.credentialId !== "string") return null;
    if (typeof v.balance !== "string" || typeof v.used !== "string") return null;
    const rule =
      v.rule && typeof v.rule.limit === "string" && typeof v.rule.period === "number"
        ? { limitStroops: BigInt(v.rule.limit), periodLedgers: v.rule.period }
        : null;
    return {
      account: { address: v.address, credentialId: v.credentialId },
      balance: BigInt(v.balance),
      used: BigInt(v.used),
      rule,
    };
  } catch {
    return null;
  }
}

function writeChain(chain: MockChain | null) {
  try {
    if (!chain) {
      window.localStorage.removeItem(MOCK_STATE_KEY);
      return;
    }
    window.localStorage.setItem(
      MOCK_STATE_KEY,
      JSON.stringify({
        address: chain.account.address,
        credentialId: chain.account.credentialId,
        balance: chain.balance.toString(),
        used: chain.used.toString(),
        rule: chain.rule ? { limit: chain.rule.limitStroops.toString(), period: chain.rule.periodLedgers } : null,
      }),
    );
  } catch {
    /* Storage is optional; the mock then forgets on reload. */
  }
}

/**
 * Fake chain shaped like the real flow: Friendbot gives 10,000 test XLM; a
 * 50 XLM send succeeds; a send that would push the window total over the
 * installed rule fails with contract error 3221. State is kept in
 * localStorage so a reload behaves like a returning visit. The mock does not
 * model time, so the 24h window never rolls over.
 */
export class MockDemoAdapter implements DemoAdapter {
  readonly mode = "mock" as const;

  private readonly scale: number;
  /** In-memory copy, used when storage is unavailable. */
  private memory: MockChain | null = null;
  private readonly receipts = new Map<string, Receipt>();

  constructor(timings: MockTimings = { scale: 1 }) {
    this.scale = timings.scale;
  }

  async createAccount(options: CreateAccountOptions = {}): Promise<DemoAccount> {
    // Passkey ceremony (the browser prompt), then deploy, then add signer.
    await wait(900, this.scale);
    if (mockFlag("fail-create")) {
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
    this.save({ account, balance: ZERO, used: ZERO, rule: null });
    return account;
  }

  async restoreSession(): Promise<DemoAccount | null> {
    await wait(250, this.scale);
    return this.load()?.account ?? null;
  }

  async getAccountState(account: DemoAccount): Promise<AccountState> {
    await wait(600, this.scale);
    const chain = this.chainFor(account);
    return { balanceStroops: chain.balance, rule: chain.rule, usedStroops: chain.used };
  }

  async fund(account: DemoAccount): Promise<FundResult> {
    await wait(2200, this.scale); // Friendbot + confirmation
    if (mockFlag("fail-fund")) {
      throw new DemoError("funding_failed", "Friendbot didn’t answer. Nothing was added. Try again in a moment.");
    }
    const chain = this.chainFor(account);
    chain.balance = FRIENDBOT_BALANCE_STROOPS;
    assertDemoBalance(chain.balance);
    this.save(chain);
    return { txHash: this.record("success"), balanceStroops: chain.balance };
  }

  async installSpendingRule(account: DemoAccount, rule: SpendingRuleParams): Promise<InstallRuleResult> {
    await wait(1400, this.scale); // passkey prompt
    if (mockFlag("cancel-rule")) {
      throw new DemoError("passkey_cancelled", "Approval was cancelled. Nothing was changed.");
    }
    await wait(600, this.scale); // add_policy tx
    const chain = this.chainFor(account);
    chain.rule = rule;
    chain.used = ZERO;
    this.save(chain);
    return { txHash: this.record("success"), rule };
  }

  async send(request: SendRequest): Promise<SendResult> {
    await wait(1100, this.scale); // passkey prompt
    if (mockFlag("cancel-send")) {
      throw new DemoError("passkey_cancelled", "Approval was cancelled. Nothing was sent.");
    }
    request.onStep?.("signed");
    await wait(900, this.scale); // simulate: the account checks signature and rule
    const chain = this.chainFor(request.account);
    if (chain.rule && chain.used + request.amountStroops > chain.rule.limitStroops) {
      throw new DemoError("spending_limit_exceeded", "Your rule said no. Nothing was sent.", {
        contractErrorCode: ERROR_SPENDING_LIMIT_EXCEEDED,
      });
    }
    if (request.amountStroops > chain.balance) {
      throw new DemoError("send_failed", "Not enough test XLM. Nothing was sent.");
    }
    request.onStep?.("checking");
    await wait(800, this.scale); // submit + ledger close
    chain.balance -= request.amountStroops;
    if (chain.rule) chain.used += request.amountStroops;
    this.save(chain);
    request.onStep?.("recorded");
    return { txHash: this.record("success"), balanceStroops: chain.balance, usedStroops: chain.used };
  }

  async getReceipt(txHash: string): Promise<Receipt> {
    await wait(300, this.scale);
    const receipt = this.receipts.get(txHash);
    if (!receipt) throw new DemoError("network_unavailable", "That transaction was not found.");
    return receipt;
  }

  async reset(): Promise<void> {
    this.receipts.clear();
    this.save(null);
  }

  /**
   * Mock only: make the fake chain match a saved or overridden step (account
   * exists at 1, funded at 2, rule at 3, 50 XLM sent at 4). Used for the dev
   * `?step=N` override and when saved progress outlives the mock's own state.
   * Keeps the existing chain when it already belongs to `address`, unless
   * `force` (the dev override) asks for a fresh chain that matches `step` exactly.
   */
  seedForStep(step: DemoStep, address: string | null, { force = false }: { force?: boolean } = {}): DemoAccount | null {
    if (step === 0) {
      this.save(null);
      return null;
    }
    const existing = this.load();
    if (!force && existing && (address === null || existing.account.address === address)) return existing.account;

    const account: DemoAccount = {
      address: address ?? mockAddress(),
      credentialId: randomString("abcdef0123456789", 32),
    };
    const sent = step >= 4 ? xlmToStroops(50) : ZERO;
    this.save({
      account,
      balance: step >= 2 ? FRIENDBOT_BALANCE_STROOPS - sent : ZERO,
      used: sent,
      rule: step >= 3 ? { limitStroops: DEMO_SPENDING_LIMIT_STROOPS, periodLedgers: DEMO_PERIOD_LEDGERS } : null,
    });
    return account;
  }

  private load(): MockChain | null {
    return readChain() ?? this.memory;
  }

  private save(chain: MockChain | null) {
    this.memory = chain;
    writeChain(chain);
  }

  private chainFor(account: DemoAccount): MockChain {
    const chain = this.load();
    if (!chain || chain.account.address !== account.address) {
      throw new DemoError("network_unavailable", "This account isn’t known to the demo. Nothing was sent.");
    }
    return chain;
  }

  private record(status: Receipt["status"]): string {
    const txHash = mockTxHash();
    this.receipts.set(txHash, { txHash, status, explorerUrl: `${MOCK_EXPLORER}/${txHash}` });
    return txHash;
  }
}
