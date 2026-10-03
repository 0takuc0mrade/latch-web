import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { DrizzleWaitlistStore } = await import("../lib/waitlist/store");

const SUBSCRIBE_INPUT = {
  email: "person@example.com",
  consentVersion: "road-to-mainnet-v1",
  subscribedAt: new Date("2026-10-03T12:00:00.000Z"),
};

function transientNetworkError(): Error {
  const error = new Error("database request failed") as Error & {
    sourceError?: unknown;
  };
  error.sourceError = new TypeError("fetch failed", {
    cause: Object.assign(new Error("connection timed out"), { code: "ETIMEDOUT" }),
  });
  return error;
}

describe("direct signup database retry", () => {
  test("retries one transient network failure", async () => {
    let attempts = 0;
    const database = {
      async execute() {
        attempts += 1;
        if (attempts === 1) throw transientNetworkError();
      },
    };
    const store = new DrizzleWaitlistStore(database as never);

    await expect(store.subscribe(SUBSCRIBE_INPUT)).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });

  test("does not retry a deterministic database error", async () => {
    let attempts = 0;
    const database = {
      async execute() {
        attempts += 1;
        throw Object.assign(new Error("constraint violation"), { code: "23514" });
      },
    };
    const store = new DrizzleWaitlistStore(database as never);

    await expect(store.subscribe(SUBSCRIBE_INPUT)).rejects.toThrow("constraint violation");
    expect(attempts).toBe(1);
  });

  test("stops after one retry when the network remains unavailable", async () => {
    let attempts = 0;
    const database = {
      async execute() {
        attempts += 1;
        throw transientNetworkError();
      },
    };
    const store = new DrizzleWaitlistStore(database as never);

    await expect(store.subscribe(SUBSCRIBE_INPUT)).rejects.toThrow("database request failed");
    expect(attempts).toBe(2);
  });
});
