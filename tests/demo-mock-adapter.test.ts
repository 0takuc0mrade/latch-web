import { beforeEach, describe, expect, test } from "bun:test";
import { DemoError } from "../lib/demo/adapter";
import {
  DEMO_PERIOD_LEDGERS,
  DEMO_SPENDING_LIMIT_STROOPS,
  ERROR_SPENDING_LIMIT_EXCEEDED,
  FRIENDBOT_BALANCE_STROOPS,
  xlmToStroops,
} from "../lib/demo/constants";
import { MockDemoAdapter } from "../lib/demo/mock-adapter";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.assign(globalThis, {
    window: {
      location: { search: "" },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    },
  });
});

const rule = { limitStroops: DEMO_SPENDING_LIMIT_STROOPS, periodLedgers: DEMO_PERIOD_LEDGERS };

describe("mock demo adapter", () => {
  test("creates an account in order and remembers it for restoreSession", async () => {
    const adapter = new MockDemoAdapter({ scale: 0 });
    const steps: string[] = [];
    const account = await adapter.createAccount({ onStep: (step) => steps.push(step) });

    expect(steps).toEqual(["passkey", "account", "signer"]);
    expect(account.address).toMatch(/^C[A-Z2-7]{55}$/);
    expect((await adapter.restoreSession())?.address).toBe(account.address);

    await adapter.reset();
    expect(await adapter.restoreSession()).toBeNull();
  });

  test("funds with the 10,000 XLM Friendbot balance", async () => {
    const adapter = new MockDemoAdapter({ scale: 0 });
    const account = await adapter.createAccount();

    expect((await adapter.fund(account)).balanceStroops).toBe(FRIENDBOT_BALANCE_STROOPS);
  });

  test("a 50 XLM send succeeds and a 150 XLM send fails with contract error 3221", async () => {
    const adapter = new MockDemoAdapter({ scale: 0 });
    const account = await adapter.createAccount();
    await adapter.fund(account);
    await adapter.installSpendingRule(account, rule);

    const sent = await adapter.send({ account, to: "CDEMO", amountStroops: xlmToStroops(50) });
    expect(sent.usedStroops).toBe(xlmToStroops(50));
    expect((await adapter.getReceipt(sent.txHash)).status).toBe("success");

    const error = await adapter
      .send({ account, to: "CDEMO", amountStroops: xlmToStroops(150) })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DemoError);
    expect((error as DemoError).code).toBe("spending_limit_exceeded");
    expect((error as DemoError).contractErrorCode).toBe(ERROR_SPENDING_LIMIT_EXCEEDED);
    expect((error as DemoError).nothingHappened).toBe(true);
  });
});
