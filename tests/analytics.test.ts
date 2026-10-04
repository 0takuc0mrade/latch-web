import { describe, expect, test } from "bun:test";
import { filterHomepageEvent } from "../app/analytics";

describe("homepage analytics", () => {
  test("retains homepage views", () => {
    const event = { type: "pageview" as const, url: "https://uselatch.app/" };

    expect(filterHomepageEvent(event)).toEqual(event);
  });

  test("removes query parameters and fragments without mutating the event", () => {
    const event = {
      type: "pageview" as const,
      url: "https://uselatch.app/?token=synthetic-test-value&utm_source=test#signup",
    };

    expect(filterHomepageEvent(event)).toEqual({
      type: "pageview",
      url: "https://uselatch.app/",
    });
    expect(event.url).toContain("synthetic-test-value");
  });

  test.each([
    "/waitlist/confirm?token=synthetic-test-value",
    "/waitlist/unsubscribe?token=synthetic-test-value",
    "/passkey-bridge",
    "/api/waitlist",
  ])("excludes %s", (path) => {
    expect(
      filterHomepageEvent({ type: "pageview", url: `https://uselatch.app${path}` }),
    ).toBeNull();
  });
});
