import { describe, expect, test } from "bun:test";
import { parseXlmAmount } from "../lib/demo/constants";

describe("parseXlmAmount (latch's amount check, without its 10 XLM cap)", () => {
  test("whole and decimal amounts, converted exactly", () => {
    expect(parseXlmAmount("50")).toBe(BigInt(500_000_000));
    expect(parseXlmAmount(" 150 ")).toBe(BigInt(1_500_000_000));
    expect(parseXlmAmount("0.0000001")).toBe(BigInt(1));
    expect(parseXlmAmount("12.3456789")).toBe(BigInt(123_456_789));
  });

  test("amounts over latch's 10 XLM cap are allowed: going over the limit is the point", () => {
    expect(parseXlmAmount("1000")).toBe(BigInt(10_000_000_000));
  });

  test.each(["", "0", "0.0", "-1", "1.12345678", "1e3", "abc", "1,5", ".5"])("rejects %p", (value) => {
    expect(parseXlmAmount(value)).toBeNull();
  });
});
