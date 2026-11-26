import { describe, expect, test } from "bun:test";
import {
  parseProgress,
  inferStepFromChain,
  parseStepOverride,
  PROGRESS_STORAGE_KEY,
  serializeProgress,
  type DemoStep,
} from "../lib/demo/progress";
import { createProgressStore } from "../lib/demo/progress-store";

const ADDRESS = `C${"A".repeat(55)}`;

describe("parseProgress", () => {
  test("round-trips a valid save", () => {
    const saved = { step: 3 as DemoStep, accountAddress: ADDRESS, updatedAt: 1_700_000_000_000 };
    expect(parseProgress(serializeProgress(saved))).toEqual(saved);
  });

  test.each([
    ["nothing saved", null],
    ["not JSON", "{oops"],
    ["not an object", "42"],
    ["step out of range", JSON.stringify({ step: 5, accountAddress: ADDRESS, updatedAt: 1 })],
    ["fractional step", JSON.stringify({ step: 1.5, accountAddress: ADDRESS, updatedAt: 1 })],
    ["past create with no account", JSON.stringify({ step: 2, accountAddress: null, updatedAt: 1 })],
    ["missing updatedAt", JSON.stringify({ step: 1, accountAddress: ADDRESS })],
    ["address of the wrong type", JSON.stringify({ step: 1, accountAddress: 7, updatedAt: 1 })],
  ])("treats %s as no progress", (_label, raw) => {
    expect(parseProgress(raw)).toBeNull();
  });

  test("drops a stray address at step 0", () => {
    expect(parseProgress(JSON.stringify({ step: 0, accountAddress: ADDRESS, updatedAt: 1 }))?.accountAddress).toBeNull();
  });
});

describe("parseStepOverride", () => {
  test("reads ?step=N outside production", () => {
    expect(parseStepOverride("?step=3", "development")).toBe(3);
    expect(parseStepOverride("?foo=1&step=0", "test")).toBe(0);
  });

  test("is ignored in production builds", () => {
    expect(parseStepOverride("?step=3", "production")).toBeNull();
  });

  test.each(["", "?step=5", "?step=-1", "?step=two", "?step=1.0"])("ignores %p", (search) => {
    expect(parseStepOverride(search, "development")).toBeNull();
  });
});

describe("progress store", () => {
  function fakeStorage() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
  }
  const saved = { step: 2 as DemoStep, accountAddress: ADDRESS, updatedAt: 5 };

  test("writes under the versioned key and returns a stable snapshot", () => {
    const storage = fakeStorage();
    const store = createProgressStore(() => storage);
    store.write(saved);
    expect(storage.data.has(PROGRESS_STORAGE_KEY)).toBe(true);
    expect(store.read()).toEqual(saved);
    expect(store.read()).toBe(store.read()); // same object until the raw value changes
  });

  test("notifies subscribers and clears", () => {
    const store = createProgressStore(() => fakeStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.write(saved);
    store.write(null);
    unsubscribe();
    store.write(saved);
    expect(calls).toBe(2);
  });

  test("falls back to memory when storage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    const store = createProgressStore(() => throwing);
    expect(store.read()).toBeNull();
    store.write(saved);
    expect(store.read()).toEqual(saved);
    store.write(null);
    expect(store.read()).toBeNull();
  });

  test("falls back to memory when there is no storage at all", () => {
    const store = createProgressStore(() => null);
    store.write(saved);
    expect(store.read()).toEqual(saved);
  });
});

describe("inferStepFromChain (Sign in on a new device)", () => {
  const rule = { limitStroops: BigInt(1), periodLedgers: 1 };
  test.each([
    ["nothing yet", { balanceStroops: BigInt(0), rule: null, usedStroops: BigInt(0) }, 1],
    ["funded", { balanceStroops: BigInt(5), rule: null, usedStroops: BigInt(0) }, 2],
    ["rule installed", { balanceStroops: BigInt(5), rule, usedStroops: BigInt(0) }, 3],
    ["rule used", { balanceStroops: BigInt(5), rule, usedStroops: BigInt(2) }, 4],
  ] as const)("%s", (_label, state, step) => {
    expect(inferStepFromChain(state)).toBe(step);
  });
});
