import { describe, expect, test } from "bun:test";
import { isPasskeyHost } from "../lib/demo/config";
import {
  HOSTED_LATCH_API_URL,
  HOSTED_RP_ID,
  LOCAL_LATCH_API_URL,
  LOCAL_RP_ID,
  isLocalBackendEnabled,
  resolveDemoRpId,
  resolveLatchApiProxyTarget,
} from "../lib/demo/local-backend";

const FLAG = { NEXT_PUBLIC_DEMO_LOCAL_BACKEND: "1" };

describe("local backend switch is dev-only", () => {
  test("production builds ignore the flag: hosted latch-api, uselatch.app passkeys", () => {
    const env = { NODE_ENV: "production", ...FLAG };
    expect(isLocalBackendEnabled(env)).toBe(false);
    expect(resolveLatchApiProxyTarget(env)).toBe(HOSTED_LATCH_API_URL);
    expect(resolveDemoRpId(env)).toBe(HOSTED_RP_ID);
  });

  test("production without the flag is the same", () => {
    const env = { NODE_ENV: "production" };
    expect(resolveLatchApiProxyTarget(env)).toBe(HOSTED_LATCH_API_URL);
    expect(resolveDemoRpId(env)).toBe(HOSTED_RP_ID);
  });

  test("only NODE_ENV=development with the flag set to 1 turns it on", () => {
    expect(isLocalBackendEnabled({ NODE_ENV: "development", ...FLAG })).toBe(true);
    expect(isLocalBackendEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isLocalBackendEnabled({ NODE_ENV: "development", NEXT_PUBLIC_DEMO_LOCAL_BACKEND: "true" })).toBe(false);
    expect(isLocalBackendEnabled({ NODE_ENV: "test", ...FLAG })).toBe(false);
    expect(isLocalBackendEnabled({ ...FLAG })).toBe(false);
  });

  test("dev with the flag: proxy to the local latch-api, RP ID localhost", () => {
    const env = { NODE_ENV: "development", ...FLAG };
    expect(resolveLatchApiProxyTarget(env)).toBe(LOCAL_LATCH_API_URL);
    expect(resolveDemoRpId(env)).toBe(LOCAL_RP_ID);
  });

  test("an explicit LATCH_API_PROXY_TARGET still wins, trailing slash trimmed", () => {
    expect(resolveLatchApiProxyTarget({ NODE_ENV: "production", LATCH_API_PROXY_TARGET: "https://example.test/" })).toBe("https://example.test");
    expect(resolveLatchApiProxyTarget({ NODE_ENV: "development", ...FLAG, LATCH_API_PROXY_TARGET: "http://127.0.0.1:9000" })).toBe("http://127.0.0.1:9000");
  });

  test("passkey host check: localhost only passes with the local backend on", () => {
    expect(isPasskeyHost("localhost", "http:", HOSTED_RP_ID, false)).toBe(false);
    expect(isPasskeyHost("localhost", "http:", LOCAL_RP_ID, false)).toBe(false);
    expect(isPasskeyHost("localhost", "http:", LOCAL_RP_ID, true)).toBe(true);
    // With the local backend on, other hosts still can't use the localhost RP ID.
    expect(isPasskeyHost("demo.vercel.app", "https:", LOCAL_RP_ID, true)).toBe(false);
    // The hosted check is untouched.
    expect(isPasskeyHost("uselatch.app", "https:", HOSTED_RP_ID, false)).toBe(true);
    expect(isPasskeyHost("demo.uselatch.app", "https:", HOSTED_RP_ID, true)).toBe(true);
  });
});
