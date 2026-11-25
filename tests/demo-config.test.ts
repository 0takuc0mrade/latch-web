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

  test("the live API base defaults to the same-origin proxy", () => {
    expect(DEMO_API_URL).toBe("/latch-api");
  });
});

describe("isPasskeyHost", () => {
  test.each([
    ["uselatch.app", "https:", true],
    ["demo.uselatch.app", "https:", true],
    ["uselatch.app", "http:", false],
    ["localhost", "http:", false],
    ["latch-web-git-feat-demo-page-latch.vercel.app", "https:", false],
    ["notuselatch.app", "https:", false],
    ["uselatch.app.evil.example", "https:", false],
  ] as const)("%s over %s → %s", (hostname, protocol, ok) => {
    expect(isPasskeyHost(hostname, protocol)).toBe(ok);
  });
});
