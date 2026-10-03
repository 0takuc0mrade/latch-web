import {
  hashConfirmationToken,
  isConfirmationToken,
  verifyUnsubscribeToken,
} from "./security";
import { normalizeEmail } from "./validation";

export const WAITLIST_ACCEPTED_MESSAGE = "You're on the waitlist.";
export const WAITLIST_CONFIRMED_MESSAGE = "Your email is confirmed.";
export const WAITLIST_UNSUBSCRIBED_MESSAGE = "You have been unsubscribed.";

export type SubscribeInput = {
  email: string;
  consentVersion: string;
  subscribedAt: Date;
};

export type ConfirmationResult = "confirmed" | "expired" | "invalid";

export interface WaitlistStore {
  subscribe(input: SubscribeInput): Promise<void>;
  confirm(confirmationTokenHash: string, confirmedAt: Date): Promise<ConfirmationResult>;
  unsubscribe(subscriberId: string, tokenVersion: number, unsubscribedAt: Date): Promise<boolean>;
}

export class InvalidWaitlistEmailError extends Error {
  constructor() {
    super("Invalid waitlist email");
    this.name = "InvalidWaitlistEmailError";
  }
}

type SignupDependencies = {
  store: WaitlistStore;
  consentVersion: string;
  now?: () => Date;
};

export async function requestWaitlistSignup(
  dependencies: SignupDependencies,
  emailInput: unknown,
): Promise<void> {
  const email = normalizeEmail(emailInput);

  if (!email) {
    throw new InvalidWaitlistEmailError();
  }

  await dependencies.store.subscribe({
    email,
    consentVersion: dependencies.consentVersion,
    subscribedAt: dependencies.now?.() ?? new Date(),
  });
}

export async function confirmWaitlistSubscription(
  store: WaitlistStore,
  token: unknown,
  now: Date = new Date(),
): Promise<ConfirmationResult> {
  if (!isConfirmationToken(token)) {
    return "invalid";
  }

  return store.confirm(hashConfirmationToken(token), now);
}

export async function unsubscribeWaitlistSubscriber(
  store: WaitlistStore,
  token: unknown,
  secret: string,
  now: Date = new Date(),
): Promise<boolean> {
  const verified = verifyUnsubscribeToken(token, secret);

  if (!verified) {
    return false;
  }

  return store.unsubscribe(verified.subscriberId, verified.tokenVersion, now);
}
