/**
 * Short-lived, tamper-proof tokens the demo API hands to the browser and
 * gets back on the next call: a passkey challenge (register / sign in) or a
 * prepared transaction (submit). Stateless, so the demo needs no session or
 * challenge table. HMAC-SHA256 with a key derived from the bundler secret.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export class TokenError extends Error {}

function key(secret: string): Buffer {
  return createHash("sha256").update(`latch-demo-token-v1:${secret}`).digest();
}

export function signToken(payload: Record<string, unknown>, secret: string, ttlMs: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now + ttlMs })).toString("base64url");
  const mac = createHmac("sha256", key(secret)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: unknown, secret: string, purpose: string, now = Date.now()): T {
  if (typeof token !== "string") throw new TokenError("Missing token");
  const [body, mac] = token.split(".");
  if (!body || !mac) throw new TokenError("Malformed token");
  const expected = createHmac("sha256", key(secret)).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new TokenError("Invalid token");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number; purpose?: string };
  if (payload.purpose !== purpose) throw new TokenError("Wrong token purpose");
  if (typeof payload.exp !== "number" || payload.exp < now) throw new TokenError("Token expired");
  return payload;
}
