import { beforeEach, describe, expect, test } from "bun:test";
import {
  InvalidWaitlistEmailError,
  confirmWaitlistSubscription,
  requestWaitlistSignup,
  unsubscribeWaitlistSubscriber,
  type ConfirmationResult,
  type SubscribeInput,
  type WaitlistStore,
} from "../lib/waitlist/service";
import {
  createUnsubscribeToken,
  hashConfirmationToken,
  verifyUnsubscribeToken,
} from "../lib/waitlist/security";
import { normalizeEmail } from "../lib/waitlist/validation";

const SUBSCRIBER_ID = "269a7c9e-cbc4-4db3-8a68-629138c58fd2";
const UNSUBSCRIBE_SECRET = "a-development-only-secret-with-more-than-32-bytes";
const TOKEN_ONE = Buffer.alloc(32, 1).toString("base64url");
const TOKEN_TWO = Buffer.alloc(32, 2).toString("base64url");
const START = new Date("2026-09-05T10:00:00.000Z");

type StoredSubscriber = {
  id: string;
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  confirmationTokenHash: string | null;
  confirmationTokenExpiresAt: Date | null;
  confirmationSentAt: Date | null;
  confirmationLastAttemptedAt: Date | null;
  confirmationSendCount: number;
  confirmationSendWindowStartedAt: Date | null;
  unsubscribeTokenVersion: number;
  consentVersion: string;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
};

class InMemoryWaitlistStore implements WaitlistStore {
  subscriber: StoredSubscriber | null = null;

  async subscribe(input: SubscribeInput): Promise<void> {
    const subscriber = this.subscriber;

    if (!subscriber) {
      this.subscriber = {
        id: SUBSCRIBER_ID,
        email: input.email,
        status: "confirmed",
        confirmationTokenHash: null,
        confirmationTokenExpiresAt: null,
        confirmationSentAt: null,
        confirmationLastAttemptedAt: null,
        confirmationSendCount: 0,
        confirmationSendWindowStartedAt: null,
        unsubscribeTokenVersion: 1,
        consentVersion: input.consentVersion,
        confirmedAt: input.subscribedAt,
        unsubscribedAt: null,
      };
      return;
    }

    if (subscriber.email !== input.email || subscriber.status === "confirmed") {
      return;
    }

    subscriber.status = "confirmed";
    subscriber.confirmationTokenHash = null;
    subscriber.confirmationTokenExpiresAt = null;
    subscriber.confirmationSentAt = null;
    subscriber.confirmationLastAttemptedAt = null;
    subscriber.confirmationSendCount = 0;
    subscriber.confirmationSendWindowStartedAt = null;
    subscriber.unsubscribeTokenVersion += 1;
    subscriber.consentVersion = input.consentVersion;
    subscriber.confirmedAt = input.subscribedAt;
    subscriber.unsubscribedAt = null;
  }

  async confirm(confirmationTokenHash: string, confirmedAt: Date): Promise<ConfirmationResult> {
    const subscriber = this.subscriber;

    if (!subscriber || subscriber.confirmationTokenHash !== confirmationTokenHash) {
      return "invalid";
    }

    if (subscriber.status === "confirmed") {
      return "confirmed";
    }

    if (subscriber.status !== "pending" || !subscriber.confirmationTokenExpiresAt) {
      return "invalid";
    }

    if (subscriber.confirmationTokenExpiresAt <= confirmedAt) {
      return "expired";
    }

    subscriber.status = "confirmed";
    subscriber.confirmedAt = confirmedAt;
    subscriber.unsubscribeTokenVersion += 1;
    return "confirmed";
  }

  async unsubscribe(
    subscriberId: string,
    tokenVersion: number,
    unsubscribedAt: Date,
  ): Promise<boolean> {
    const subscriber = this.subscriber;

    if (
      !subscriber ||
      subscriber.id !== subscriberId ||
      subscriber.unsubscribeTokenVersion !== tokenVersion ||
      !["confirmed", "unsubscribed"].includes(subscriber.status)
    ) {
      return false;
    }

    if (subscriber.status === "confirmed") {
      subscriber.status = "unsubscribed";
      subscriber.unsubscribedAt = unsubscribedAt;
    }

    return true;
  }
}

let store: InMemoryWaitlistStore;
let now: Date;

function dependencies(consentVersion = "road-to-mainnet-v1") {
  return {
    store,
    consentVersion,
    now: () => now,
  };
}

async function signup(email = "person@example.com", consentVersion?: string) {
  await requestWaitlistSignup(dependencies(consentVersion), email);
}

function setLegacyPendingSubscriber(token = TOKEN_ONE, tokenVersion = 0): void {
  store.subscriber = {
    id: SUBSCRIBER_ID,
    email: "person@example.com",
    status: "pending",
    confirmationTokenHash: hashConfirmationToken(token),
    confirmationTokenExpiresAt: new Date(START.getTime() + 24 * 60 * 60 * 1_000),
    confirmationSentAt: START,
    confirmationLastAttemptedAt: START,
    confirmationSendCount: 1,
    confirmationSendWindowStartedAt: START,
    unsubscribeTokenVersion: tokenVersion,
    consentVersion: "road-to-mainnet-v1",
    confirmedAt: null,
    unsubscribedAt: null,
  };
}

beforeEach(() => {
  store = new InMemoryWaitlistStore();
  now = new Date(START);
});

describe("email validation", () => {
  test("normalizes a valid address", () => {
    expect(normalizeEmail("  Person.Name+Mainnet@Example.COM ")).toBe(
      "person.name+mainnet@example.com",
    );
  });

  test.each(["person", "@example.com", "person@", "person..name@example.com", "person@example"])(
    "rejects malformed address %s",
    (email) => {
      expect(normalizeEmail(email)).toBeNull();
    },
  );

  test("rejects an excessive address length", () => {
    expect(normalizeEmail(`${"a".repeat(245)}@example.com`)).toBeNull();
  });
});

describe("direct signup", () => {
  test("creates a confirmed subscriber without confirmation-token state", async () => {
    await signup(" Person@Example.COM ");

    expect(store.subscriber).toMatchObject({
      email: "person@example.com",
      status: "confirmed",
      confirmationTokenHash: null,
      confirmationTokenExpiresAt: null,
      confirmationSentAt: null,
      confirmationLastAttemptedAt: null,
      confirmationSendCount: 0,
      confirmationSendWindowStartedAt: null,
      unsubscribeTokenVersion: 1,
      confirmedAt: START,
      unsubscribedAt: null,
    });
  });

  test("keeps duplicate and concurrent signup idempotent", async () => {
    await Promise.all([signup(), signup(), signup()]);

    expect(store.subscriber?.status).toBe("confirmed");
    expect(store.subscriber?.unsubscribeTokenVersion).toBe(1);
    expect(store.subscriber?.confirmedAt).toEqual(START);
  });

  test("converts a legacy pending subscriber and invalidates its confirmation token", async () => {
    setLegacyPendingSubscriber();

    await signup();

    expect(store.subscriber?.status).toBe("confirmed");
    expect(store.subscriber?.confirmationTokenHash).toBeNull();
    expect(store.subscriber?.confirmationSendCount).toBe(0);
    expect(store.subscriber?.unsubscribeTokenVersion).toBe(1);
    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("invalid");
  });

  test("resubscribes immediately and invalidates the previous unsubscribe token", async () => {
    await signup();
    const oldToken = createUnsubscribeToken(SUBSCRIBER_ID, 1, UNSUBSCRIBE_SECRET);
    expect(await unsubscribeWaitlistSubscriber(store, oldToken, UNSUBSCRIBE_SECRET, now)).toBe(true);

    now = new Date(START.getTime() + 1_000);
    await signup("person@example.com", "road-to-mainnet-v2");

    expect(store.subscriber?.status).toBe("confirmed");
    expect(store.subscriber?.unsubscribeTokenVersion).toBe(2);
    expect(store.subscriber?.consentVersion).toBe("road-to-mainnet-v2");
    expect(store.subscriber?.unsubscribedAt).toBeNull();
    expect(await unsubscribeWaitlistSubscriber(store, oldToken, UNSUBSCRIBE_SECRET, now)).toBe(
      false,
    );
  });

  test("rejects malformed input before storing a subscriber", async () => {
    await expect(requestWaitlistSignup(dependencies(), "not-an-email")).rejects.toBeInstanceOf(
      InvalidWaitlistEmailError,
    );
    expect(store.subscriber).toBeNull();
  });
});

describe("legacy confirmation", () => {
  test("confirms an existing valid token and treats replay as success", async () => {
    setLegacyPendingSubscriber();

    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("confirmed");
    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("confirmed");
    expect(store.subscriber?.unsubscribeTokenVersion).toBe(1);
  });

  test("rejects an expired token", async () => {
    setLegacyPendingSubscriber();
    now = new Date(START.getTime() + 24 * 60 * 60 * 1_000 + 1);

    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("expired");
    expect(store.subscriber?.status).toBe("pending");
  });

  test("rejects malformed and unknown tokens", async () => {
    setLegacyPendingSubscriber();

    expect(await confirmWaitlistSubscription(store, "bad-token", now)).toBe("invalid");
    expect(await confirmWaitlistSubscription(store, TOKEN_TWO, now)).toBe("invalid");
  });

  test("cannot reactivate an unsubscribed subscriber", async () => {
    setLegacyPendingSubscriber();
    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("confirmed");
    const unsubscribeToken = createUnsubscribeToken(SUBSCRIBER_ID, 1, UNSUBSCRIBE_SECRET);
    expect(
      await unsubscribeWaitlistSubscriber(store, unsubscribeToken, UNSUBSCRIBE_SECRET, now),
    ).toBe(true);

    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("invalid");
    expect(store.subscriber?.status).toBe("unsubscribed");
  });
});

describe("unsubscribe", () => {
  async function confirmedSubscriber() {
    await signup();
    return createUnsubscribeToken(SUBSCRIBER_ID, 1, UNSUBSCRIBE_SECRET);
  }

  test("accepts a valid signature and repeated unsubscribe", async () => {
    const token = await confirmedSubscriber();

    expect(await unsubscribeWaitlistSubscriber(store, token, UNSUBSCRIBE_SECRET, now)).toBe(true);
    const firstUnsubscribedAt = store.subscriber?.unsubscribedAt;
    now = new Date(START.getTime() + 1_000);
    expect(await unsubscribeWaitlistSubscriber(store, token, UNSUBSCRIBE_SECRET, now)).toBe(true);
    expect(store.subscriber?.unsubscribedAt).toEqual(firstUnsubscribedAt);
  });

  test("accepts canonical unsubscribe version 1", () => {
    const token = createUnsubscribeToken(SUBSCRIBER_ID, 1, UNSUBSCRIBE_SECRET);

    expect(verifyUnsubscribeToken(token, UNSUBSCRIBE_SECRET)).toEqual({
      subscriberId: SUBSCRIBER_ID,
      tokenVersion: 1,
    });
  });

  test("rejects an invalid signature", async () => {
    const token = await confirmedSubscriber();
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(await unsubscribeWaitlistSubscriber(store, tampered, UNSUBSCRIBE_SECRET, now)).toBe(
      false,
    );
  });

  test("rejects a changed token version", async () => {
    await confirmedSubscriber();
    const wrongVersion = createUnsubscribeToken(SUBSCRIBER_ID, 2, UNSUBSCRIBE_SECRET);

    expect(
      await unsubscribeWaitlistSubscriber(store, wrongVersion, UNSUBSCRIBE_SECRET, now),
    ).toBe(false);
  });

  test.each(["0", "01", "+1", "1e0", "1.0", "-1", " 1", "1 ", "2147483648"])(
    "rejects non-canonical unsubscribe version %s",
    async (version) => {
      const token = await confirmedSubscriber();
      const [prefix, subscriberId, , signature] = token.split(".");
      const nonCanonical = `${prefix}.${subscriberId}.${version}.${signature}`;

      expect(
        await unsubscribeWaitlistSubscriber(store, nonCanonical, UNSUBSCRIBE_SECRET, now),
      ).toBe(false);
    },
  );

  test.each([0, -1, 1.5, 2_147_483_648])(
    "rejects creation with unsubscribe version %d",
    (version) => {
      expect(() => createUnsubscribeToken(SUBSCRIBER_ID, version, UNSUBSCRIBE_SECRET)).toThrow(
        RangeError,
      );
    },
  );
});
