import { describe, expect, test } from "bun:test";
import {
  type ConfirmationResult,
  type SubscribeInput,
  type WaitlistStore,
} from "../lib/waitlist/service";
import { handleWaitlistSignupRequest } from "../lib/waitlist/signup-route";

class RouteStore implements WaitlistStore {
  subscriptions: SubscribeInput[] = [];

  constructor(private readonly failure?: Error) {}

  async subscribe(input: SubscribeInput): Promise<void> {
    if (this.failure) throw this.failure;
    this.subscriptions.push(input);
  }

  async confirm(): Promise<ConfirmationResult> {
    return "invalid";
  }

  async unsubscribe(): Promise<boolean> {
    return false;
  }
}

function signupRequest(email = "person@example.com"): Request {
  return new Request("https://uselatch.app/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("signup public response", () => {
  test("confirms a valid signup immediately", async () => {
    const store = new RouteStore();
    const response = await handleWaitlistSignupRequest(signupRequest(" Person@Example.COM "), {
      getStore: () => store,
      getConsentVersion: () => "road-to-mainnet-v1",
      reportFailure: () => undefined,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "You're on the waitlist.",
    });
    expect(store.subscriptions).toHaveLength(1);
    expect(store.subscriptions[0]?.email).toBe("person@example.com");
  });

  test("returns a safe error when the database is unavailable", async () => {
    const reported: string[] = [];
    const response = await handleWaitlistSignupRequest(signupRequest(), {
      getStore: () => new RouteStore(new Error("database unavailable")),
      getConsentVersion: () => "road-to-mainnet-v1",
      reportFailure: (kind) => reported.push(kind),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      message: "We could not process your request right now. Please try again.",
    });
    expect(reported).toEqual(["database-or-configuration"]);
  });

  test("returns the same safe error when configuration is unavailable", async () => {
    const reported: string[] = [];
    const response = await handleWaitlistSignupRequest(signupRequest(), {
      getStore: () => new RouteStore(),
      getConsentVersion: () => {
        throw new Error("configuration unavailable");
      },
      reportFailure: (kind) => reported.push(kind),
    });

    expect(response.status).toBe(503);
    expect(reported).toEqual(["database-or-configuration"]);
  });
});
