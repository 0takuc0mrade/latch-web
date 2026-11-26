import { describe, expect, test } from "bun:test";
import { DEMO_API_URL, isPasskeyHost, resolveDemoAdapterMode } from "../lib/demo";

describe("adapter selection: live by default, mock opt-in", () => {
  test.each([
    [{ envAdapter: undefined, search: "", nodeEnv: "production" }, "live"],
    [{ envAdapter: "live", search: "", nodeEnv: "production" }, "live"],
    [{ envAdapter: "mock", search: "", nodeEnv: "production" }, "mock"],
    [{ envAdapter: undefined, search: "?mock", nodeEnv: "development" }, "mock"],
    [{ envAdapter: undefined, search: "?mock=cancel-send", nodeEnv: "development" }, "mock"],
    [{ envAdapter: undefined, search: "?mock=cancel-send", nodeEnv: "production" }, "live"],
    [{ envAdapter: undefined, search: "?step=3", nodeEnv: "development" }, "live"],
    // "Try a simulated walkthrough": only where passkeys can't work (a Vercel preview is a production build).
    [{ envAdapter: undefined, search: "?simulated", nodeEnv: "production", passkeyHost: false }, "mock"],
    // On uselatch.app production stays live only, whatever the URL says.
    [{ envAdapter: undefined, search: "?simulated", nodeEnv: "production", passkeyHost: true }, "live"],
    [{ envAdapter: undefined, search: "?simulated", nodeEnv: "production" }, "live"],
    [{ envAdapter: undefined, search: "", nodeEnv: "production", passkeyHost: false }, "live"],
  ] as const)("%j → %s", (input, mode) => {
    expect(resolveDemoAdapterMode(input)).toBe(mode);
  });

  test("the live API is the demo's own routes, on the same origin", () => {
    expect(DEMO_API_URL).toBe("/api/demo");
  });
});

describe("isPasskeyHost", () => {
  // No demo host configured (previews, local dev): any secure context except the wallet's own domain.
  test.each([
    ["uselatch.app", "https:", false],
    ["demo.uselatch.app", "https:", true],
    ["latch-web-git-feat-demo-page-latch.vercel.app", "https:", true],
    ["localhost", "http:", true],
    ["127.0.0.1", "http:", true],
    ["example.com", "http:", false],
  ] as const)("no demo host: %s over %s → %s", (hostname, protocol, ok) => {
    expect(isPasskeyHost(hostname, protocol, null)).toBe(ok);
  });

  // Production: only the demo's own host.
  test.each([
    ["demo.uselatch.app", "https:", true],
    ["demo.uselatch.app", "http:", false],
    ["uselatch.app", "https:", false],
    ["latch-web.vercel.app", "https:", false],
    ["localhost", "http:", false],
  ] as const)("demo host demo.uselatch.app: %s over %s → %s", (hostname, protocol, ok) => {
    expect(isPasskeyHost(hostname, protocol, "demo.uselatch.app")).toBe(ok);
  });
});
