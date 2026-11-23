import { describe, expect, test } from "bun:test";
import { DemoError } from "../lib/demo/adapter";
import { xlmToStroops } from "../lib/demo/constants";
import { assertDemoBalance, MIN_DEMO_BALANCE_STROOPS } from "../lib/demo/funding";

describe("assertDemoBalance", () => {
  test("accepts the Friendbot balance and exactly 150 XLM", () => {
    expect(() => assertDemoBalance(xlmToStroops(10_000))).not.toThrow();
    expect(() => assertDemoBalance(MIN_DEMO_BALANCE_STROOPS)).not.toThrow();
  });

  test("rejects the 10 XLM bridge fallback with a funding_failed error that says nothing was sent", () => {
    const error = (() => {
      try {
        assertDemoBalance(xlmToStroops(10));
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(DemoError);
    expect((error as DemoError).code).toBe("funding_failed");
    expect((error as DemoError).message).toContain("10 test XLM");
    expect((error as DemoError).message).toContain("Nothing was sent");
  });

  test("rejects a balance just under 150 XLM", () => {
    expect(() => assertDemoBalance(MIN_DEMO_BALANCE_STROOPS - BigInt(1))).toThrow(DemoError);
  });
});
