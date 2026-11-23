import { describe, expect, test } from "bun:test";
import {
  computeReveal,
  currentChapter,
  parseProgress,
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

describe("computeReveal (the canvas rules)", () => {
  test("before hydration: neutral CTA and nothing revealed, whatever is saved", () => {
    const reveal = computeReveal({ hydrated: false, step: 3, revealed: false });
    expect(reveal.heroCta).toBe("pending");
    expect(reveal.heroAccountCard).toBe(false);
    expect(reveal.chapters).toEqual({ fund: "hidden", rule: "hidden", try: "hidden" });
    expect(reveal.showClosing).toBe(false);
  });

  test("first visit: only the hero, with Create account", () => {
    const reveal = computeReveal({ hydrated: true, step: 0, revealed: true });
    expect(reveal.heroCta).toBe("create");
    expect(reveal.heroAccountCard).toBe(false);
    expect(reveal.chapters).toEqual({ fund: "hidden", rule: "hidden", try: "hidden" });
    expect(reveal.showClosing).toBe(false);
    expect(currentChapter(reveal)).toBeNull();
  });

  test.each([
    [1, { fund: "now", rule: "hidden", try: "hidden" }, "fund", false],
    [2, { fund: "done", rule: "now", try: "hidden" }, "rule", false],
    [3, { fund: "done", rule: "done", try: "now" }, "try", false],
    [4, { fund: "done", rule: "done", try: "done" }, null, true],
  ] as const)("step %i: done chapters plus the next one", (step, chapters, current, closing) => {
    const reveal = computeReveal({ hydrated: true, step, revealed: true });
    expect(reveal.heroCta).toBe("done");
    expect(reveal.heroAccountCard).toBe(true);
    expect(reveal.chapters).toEqual(chapters);
    expect(currentChapter(reveal)).toBe(current);
    expect(reveal.showClosing).toBe(closing);
  });

  test("returning visitor before Continue: Continue CTA, preview card, nothing below", () => {
    const reveal = computeReveal({ hydrated: true, step: 2, revealed: false });
    expect(reveal.heroCta).toBe("continue");
    expect(reveal.heroAccountCard).toBe(false);
    expect(reveal.chapters).toEqual({ fund: "hidden", rule: "hidden", try: "hidden" });
  });

  test("returning visitor after Continue: every finished chapter plus the next", () => {
    const reveal = computeReveal({ hydrated: true, step: 2, revealed: true });
    expect(reveal.chapters).toEqual({ fund: "done", rule: "now", try: "hidden" });
    expect(currentChapter(reveal)).toBe("rule");
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
