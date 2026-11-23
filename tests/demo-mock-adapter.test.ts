import { beforeEach, describe, expect, test } from "bun:test";
import { DemoError, type DemoAccount, type SendStep } from "../lib/demo/adapter";
import {
  DEMO_PERIOD_LEDGERS,
  DEMO_SPENDING_LIMIT_STROOPS,
  ERROR_SPENDING_LIMIT_EXCEEDED,
  FRIENDBOT_BALANCE_STROOPS,
  xlmToStroops,
} from "../lib/demo/constants";
import { MOCK_STATE_KEY, MockDemoAdapter } from "../lib/demo/mock-adapter";

const store = new Map<string, string>();
let search = "";

beforeEach(() => {
  store.clear();
  search = "";
  Object.assign(globalThis, {
    window: {
      get location() {
        return { search };
      },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    },
  });
});

const rule = { limitStroops: DEMO_SPENDING_LIMIT_STROOPS, periodLedgers: DEMO_PERIOD_LEDGERS };
const send = (adapter: MockDemoAdapter, account: DemoAccount, xlm: number, onStep?: (s: SendStep) => void) =>
  adapter.send({ account, to: "GDEMO", amountStroops: xlmToStroops(xlm), onStep });
const rejection = (promise: Promise<unknown>) => promise.then(() => null, (caught: unknown) => caught as DemoError);

describe("mock demo adapter", () => {
  test("creates an account in order and remembers it across instances (a reload)", async () => {
    const adapter = new MockDemoAdapter({ scale: 0 });
    const steps: string[] = [];
    const account = await adapter.createAccount({ onStep: (step) => steps.push(step) });

    expect(steps).toEqual(["passkey", "account", "signer"]);
    expect(account.address).toMatch(/^C[A-Z2-7]{55}$/);
    expect((await new MockDemoAdapter({ scale: 0 }).restoreSession())?.address).toBe(account.address);

    await adapter.reset();
    expect(store.has(MOCK_STATE_KEY)).toBe(false);
    expect(await adapter.restoreSession()).toBeNull();
  });

  test("funds with the 10,000 XLM Friendbot balance", async () => {
    const adapter = new MockDemoAdapter({ scale: 0 });
    const account = await adapter.createAccount();

    expect((await adapter.fund(account)).balanceStroops).toBe(FRIENDBOT_BALANCE_STROOPS);
    expect((await adapter.getAccountState(account)).balanceStroops).toBe(FRIENDBOT_BALANCE_STROOPS);
  });

  test("50 XLM succeeds with all three signing steps; 150 XLM fails with 3221 after signing", async () => {
    const adapter = new MockDemoAdapter({ scale: 0 });
    const account = await adapter.createAccount();
    await adapter.fund(account);
    await adapter.installSpendingRule(account, rule);

    const okSteps: SendStep[] = [];
    const sent = await send(adapter, account, 50, (step) => okSteps.push(step));
    expect(okSteps).toEqual(["signed", "checking", "recorded"]);
    expect(sent.usedStroops).toBe(xlmToStroops(50));
    expect((await adapter.getReceipt(sent.txHash)).status).toBe("success");

    const blockedSteps: SendStep[] = [];
    const error = await rejection(send(adapter, account, 150, (step) => blockedSteps.push(step)));
    expect(blockedSteps).toEqual(["signed"]); // the passkey approved; the account said no
    expect(error).toBeInstanceOf(DemoError);
    expect(error?.code).toBe("spending_limit_exceeded");
    expect(error?.contractErrorCode).toBe(ERROR_SPENDING_LIMIT_EXCEEDED);
    expect(error?.nothingHappened).toBe(true);

    const state = await adapter.getAccountState(account);
    expect(state.usedStroops).toBe(xlmToStroops(50));
    expect(state.balanceStroops).toBe(FRIENDBOT_BALANCE_STROOPS - xlmToStroops(50));
  });

  test("QA flags: cancel-send, cancel-rule and fail-fund change nothing", async () => {
    const adapter = new MockDemoAdapter({ scale: 0 });
    const account = await adapter.createAccount();

    search = "?mock=fail-fund";
    expect((await rejection(adapter.fund(account)))?.code).toBe("funding_failed");
    expect((await adapter.getAccountState(account)).balanceStroops).toBe(BigInt(0));

    search = "";
    await adapter.fund(account);
    search = "?mock=cancel-rule";
    expect((await rejection(adapter.installSpendingRule(account, rule)))?.code).toBe("passkey_cancelled");
    expect((await adapter.getAccountState(account)).rule).toBeNull();

    search = "";
    await adapter.installSpendingRule(account, rule);
    search = "?mock=cancel-send,fail-fund";
    expect((await rejection(send(adapter, account, 50)))?.code).toBe("passkey_cancelled");
    expect((await adapter.getAccountState(account)).usedStroops).toBe(BigInt(0));
  });

  test("seedForStep makes the fake chain match a saved step, and keeps an existing matching chain", async () => {
    const adapter = new MockDemoAdapter({ scale: 0 });
    const seeded = adapter.seedForStep(4, null)!;
    const state = await adapter.getAccountState(seeded);
    expect(state.rule?.limitStroops).toBe(DEMO_SPENDING_LIMIT_STROOPS);
    expect(state.usedStroops).toBe(xlmToStroops(50));
    expect(state.balanceStroops).toBe(FRIENDBOT_BALANCE_STROOPS - xlmToStroops(50));

    // Same address: nothing is overwritten.
    expect(adapter.seedForStep(2, seeded.address)?.address).toBe(seeded.address);
    expect((await adapter.getAccountState(seeded)).usedStroops).toBe(xlmToStroops(50));

    // Step 2 for a different account: funded, no rule yet.
    const other = adapter.seedForStep(2, `C${"B".repeat(55)}`)!;
    const otherState = await adapter.getAccountState(other);
    expect(otherState.balanceStroops).toBe(FRIENDBOT_BALANCE_STROOPS);
    expect(otherState.rule).toBeNull();

    // force (dev ?step override): a fresh chain that matches the step exactly.
    const forced = adapter.seedForStep(3, null, { force: true })!;
    expect(forced.address).not.toBe(other.address);
    const forcedState = await adapter.getAccountState(forced);
    expect(forcedState.usedStroops).toBe(BigInt(0));
    expect(forcedState.rule?.limitStroops).toBe(DEMO_SPENDING_LIMIT_STROOPS);

    expect(adapter.seedForStep(0, null)).toBeNull();
    expect(await adapter.restoreSession()).toBeNull();
  });

  describe("spending rule is cumulative over the 24h window, not per send", () => {
    async function ruledAccount() {
      const adapter = new MockDemoAdapter({ scale: 0 });
      const account = await adapter.createAccount();
      await adapter.fund(account);
      await adapter.installSpendingRule(account, rule);
      return { adapter, account };
    }

    test("after 50 XLM, 100 XLM is blocked even though 100 alone fits the rule", async () => {
      const { adapter, account } = await ruledAccount();
      await send(adapter, account, 50);
      const error = await rejection(send(adapter, account, 100));
      expect(error?.code).toBe("spending_limit_exceeded");
      expect(error?.contractErrorCode).toBe(ERROR_SPENDING_LIMIT_EXCEEDED);
      expect((await adapter.getAccountState(account)).usedStroops).toBe(xlmToStroops(50));
    });

    test("50 + 50 is allowed (exactly 100), then even 1 XLM more is blocked", async () => {
      const { adapter, account } = await ruledAccount();
      await send(adapter, account, 50);
      const second = await send(adapter, account, 50);
      expect(second.usedStroops).toBe(DEMO_SPENDING_LIMIT_STROOPS);
      expect((await rejection(send(adapter, account, 1)))?.code).toBe("spending_limit_exceeded");
      expect((await rejection(send(adapter, account, 150)))?.code).toBe("spending_limit_exceeded");
    });

    test("usage and balance only move on sends that go through", async () => {
      const { adapter, account } = await ruledAccount();
      await send(adapter, account, 50);
      await rejection(send(adapter, account, 100));
      await send(adapter, account, 50);
      await rejection(send(adapter, account, 150));
      const state = await adapter.getAccountState(account);
      expect(state.usedStroops).toBe(xlmToStroops(100));
      expect(state.balanceStroops).toBe(FRIENDBOT_BALANCE_STROOPS - xlmToStroops(100));
    });

    test("a single send over the limit is blocked with nothing used", async () => {
      const { adapter, account } = await ruledAccount();
      expect((await rejection(send(adapter, account, 150)))?.code).toBe("spending_limit_exceeded");
      expect((await adapter.getAccountState(account)).usedStroops).toBe(BigInt(0));
    });
  });

  describe("Sign in (restoreSession with prompt)", () => {
    test("finds the account on this device", async () => {
      const adapter = new MockDemoAdapter({ scale: 0 });
      const account = await adapter.createAccount();
      expect((await adapter.restoreSession({ prompt: true }))?.address).toBe(account.address);
    });

    test("returns null on a new device with no account", async () => {
      expect(await new MockDemoAdapter({ scale: 0 }).restoreSession({ prompt: true })).toBeNull();
    });

    test("signin-found: an account created elsewhere, already funded", async () => {
      search = "?mock=signin-found";
      const adapter = new MockDemoAdapter({ scale: 0 });
      const found = await adapter.restoreSession({ prompt: true });
      expect(found).not.toBeNull();
      expect((await adapter.getAccountState(found!)).balanceStroops).toBe(FRIENDBOT_BALANCE_STROOPS);
    });

    test("cancel-signin rejects with passkey_cancelled", async () => {
      search = "?mock=cancel-signin";
      expect((await rejection(new MockDemoAdapter({ scale: 0 }).restoreSession({ prompt: true })))?.code).toBe(
        "passkey_cancelled",
      );
    });
  });
});

