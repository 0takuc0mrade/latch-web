import { describe, expect, test } from "bun:test";
import { handleSessionReset } from "../lib/demo/session-reset";

describe("demo session reset (Start a new account)", () => {
  test("expires latch-api's sid cookie for the whole site", () => {
    const response = handleSessionReset(new Request("http://localhost:3000/api/demo/reset-session", { method: "POST", headers: { origin: "http://localhost:3000" } }));
    expect(response.status).toBe(204);
    const cookies = response.headers.getSetCookie();
    expect(cookies.every((c) => c.startsWith("sid=;") && c.includes("Max-Age=0"))).toBe(true);
    // latch-api's own cookie: host-only, path "/".
    expect(cookies.some((c) => c.includes("Path=/;") && !c.includes("Domain") && !c.includes("Secure"))).toBe(true);
    // latch's Next app leaves a Secure, SameSite=None sid on localhost; that one is expired too.
    expect(cookies.some((c) => c.includes("Secure; SameSite=None") && !c.includes("Domain"))).toBe(true);
  });

  test("on https the Secure variants are included (latch-api's production cookie is Secure)", () => {
    const response = handleSessionReset(new Request("https://uselatch.app/api/demo/reset-session", { method: "POST" }));
    expect(response.headers.getSetCookie().some((c) => c.includes("Secure; SameSite=None"))).toBe(true);
  });

  test("plain http on another host can't set Secure cookies, so those variants are left out", () => {
    const response = handleSessionReset(new Request("http://192.168.0.154:3000/api/demo/reset-session", { method: "POST" }));
    expect(response.headers.getSetCookie().some((c) => c.includes("Secure"))).toBe(false);
  });

  test("another site can't trigger it", () => {
    const response = handleSessionReset(new Request("https://uselatch.app/api/demo/reset-session", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
