import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const CONFIRMATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSUBSCRIBE_TOKEN_PREFIX = "v1";
const UNSUBSCRIBE_TOKEN_VERSION_PATTERN = /^[1-9][0-9]*$/;
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isConfirmationToken(value: unknown): value is string {
  return typeof value === "string" && CONFIRMATION_TOKEN_PATTERN.test(value);
}

export function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function unsubscribePayload(subscriberId: string, tokenVersion: number): string {
  return `${UNSUBSCRIBE_TOKEN_PREFIX}.${subscriberId}.${tokenVersion}`;
}

function signUnsubscribePayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function createUnsubscribeToken(
  subscriberId: string,
  tokenVersion: number,
  secret: string,
): string {
  if (
    !Number.isInteger(tokenVersion) ||
    tokenVersion < 1 ||
    tokenVersion > POSTGRES_INTEGER_MAX
  ) {
    throw new RangeError("Invalid unsubscribe token version");
  }

  const payload = unsubscribePayload(subscriberId, tokenVersion);
  return `${payload}.${signUnsubscribePayload(payload, secret)}`;
}

export type VerifiedUnsubscribeToken = {
  subscriberId: string;
  tokenVersion: number;
};

function parseUnsubscribeToken(token: unknown): (VerifiedUnsubscribeToken & { signature: string }) | null {
  if (typeof token !== "string" || token.length > 160) {
    return null;
  }

  const [prefix, subscriberId, versionValue, suppliedSignature, ...extra] = token.split(".");

  if (!UNSUBSCRIBE_TOKEN_VERSION_PATTERN.test(versionValue ?? "")) {
    return null;
  }

  const tokenVersion = Number(versionValue);

  if (
    extra.length > 0 ||
    prefix !== UNSUBSCRIBE_TOKEN_PREFIX ||
    !UUID_PATTERN.test(subscriberId ?? "") ||
    !Number.isInteger(tokenVersion) ||
    tokenVersion > POSTGRES_INTEGER_MAX ||
    !SIGNATURE_PATTERN.test(suppliedSignature ?? "")
  ) {
    return null;
  }

  return { subscriberId, tokenVersion, signature: suppliedSignature };
}

export function isUnsubscribeToken(token: unknown): token is string {
  return parseUnsubscribeToken(token) !== null;
}

export function verifyUnsubscribeToken(
  token: unknown,
  secret: string,
): VerifiedUnsubscribeToken | null {
  const parsed = parseUnsubscribeToken(token);

  if (!parsed) {
    return null;
  }

  const { subscriberId, tokenVersion, signature: suppliedSignature } = parsed;

  const payload = unsubscribePayload(subscriberId, tokenVersion);
  const expectedSignature = signUnsubscribePayload(payload, secret);
  const expected = Buffer.from(expectedSignature, "utf8");
  const supplied = Buffer.from(suppliedSignature, "utf8");

  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return null;
  }

  return { subscriberId, tokenVersion };
}
