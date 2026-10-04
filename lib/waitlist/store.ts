import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { getWaitlistDatabase } from "./db";
import { waitlistSubscribers } from "./schema";
import type {
  ConfirmationResult,
  SubscribeInput,
  WaitlistStore,
} from "./service";

type Database = NeonHttpDatabase<{ waitlistSubscribers: typeof waitlistSubscribers }>;

const TRANSIENT_DATABASE_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isTransientDatabaseError(error: unknown): boolean {
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);

    const candidate = current as {
      cause?: unknown;
      code?: unknown;
      errors?: unknown;
      message?: unknown;
      name?: unknown;
      sourceError?: unknown;
    };

    if (typeof candidate.code === "string" && TRANSIENT_DATABASE_ERROR_CODES.has(candidate.code)) {
      return true;
    }

    if (
      candidate.name === "AbortError" ||
      candidate.name === "TimeoutError" ||
      (candidate.name === "TypeError" && candidate.message === "fetch failed")
    ) {
      return true;
    }

    pending.push(candidate.cause, candidate.sourceError);

    if (Array.isArray(candidate.errors)) {
      pending.push(...candidate.errors);
    }
  }

  return false;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class DrizzleWaitlistStore implements WaitlistStore {
  constructor(private readonly database: Database) {}

  async subscribe(input: SubscribeInput): Promise<void> {
    const query = sql`
      insert into waitlist_subscribers (
        email,
        status,
        unsubscribe_token_version,
        consent_version,
        created_at,
        updated_at,
        confirmed_at
      ) values (
        ${input.email},
        'confirmed',
        1,
        ${input.consentVersion},
        ${input.subscribedAt},
        ${input.subscribedAt},
        ${input.subscribedAt}
      )
      on conflict (email) do update set
        status = 'confirmed',
        confirmation_token_hash = null,
        confirmation_token_expires_at = null,
        confirmation_sent_at = null,
        confirmation_last_attempted_at = null,
        confirmation_send_count = 0,
        confirmation_send_window_started_at = null,
        unsubscribe_token_version = waitlist_subscribers.unsubscribe_token_version + 1,
        consent_version = excluded.consent_version,
        updated_at = excluded.updated_at,
        confirmed_at = excluded.confirmed_at,
        unsubscribed_at = null
      where waitlist_subscribers.status in ('pending', 'unsubscribed')
    `;

    try {
      await this.database.execute(query);
    } catch (error) {
      if (!isTransientDatabaseError(error)) throw error;

      await wait(150);
      await this.database.execute(query);
    }
  }

  async confirm(confirmationTokenHash: string, confirmedAt: Date): Promise<ConfirmationResult> {
    const confirmed = await this.database
      .update(waitlistSubscribers)
      .set({
        status: "confirmed",
        confirmedAt,
        updatedAt: confirmedAt,
        unsubscribeTokenVersion: sql`${waitlistSubscribers.unsubscribeTokenVersion} + 1`,
      })
      .where(
        and(
          eq(waitlistSubscribers.confirmationTokenHash, confirmationTokenHash),
          eq(waitlistSubscribers.status, "pending"),
          gt(waitlistSubscribers.confirmationTokenExpiresAt, confirmedAt),
        ),
      )
      .returning({ id: waitlistSubscribers.id });

    if (confirmed.length === 1) {
      return "confirmed";
    }

    const [subscriber] = await this.database
      .select({
        status: waitlistSubscribers.status,
        confirmationTokenExpiresAt: waitlistSubscribers.confirmationTokenExpiresAt,
      })
      .from(waitlistSubscribers)
      .where(eq(waitlistSubscribers.confirmationTokenHash, confirmationTokenHash))
      .limit(1);

    if (subscriber?.status === "confirmed") {
      return "confirmed";
    }

    if (
      subscriber?.status === "pending" &&
      subscriber.confirmationTokenExpiresAt &&
      subscriber.confirmationTokenExpiresAt <= confirmedAt
    ) {
      return "expired";
    }

    return "invalid";
  }

  async unsubscribe(
    subscriberId: string,
    tokenVersion: number,
    unsubscribedAt: Date,
  ): Promise<boolean> {
    const result = await this.database.execute<{ id: string }>(sql`
      update waitlist_subscribers
      set
        status = 'unsubscribed',
        unsubscribed_at = case
          when status = 'unsubscribed' then unsubscribed_at
          else ${unsubscribedAt}
        end,
        updated_at = case
          when status = 'unsubscribed' then updated_at
          else ${unsubscribedAt}
        end
      where id = ${subscriberId}
        and unsubscribe_token_version = ${tokenVersion}
        and status in ('confirmed', 'unsubscribed')
      returning id
    `);

    return result.rows.length === 1;
  }
}

export function getWaitlistStore(): WaitlistStore {
  return new DrizzleWaitlistStore(getWaitlistDatabase());
}
