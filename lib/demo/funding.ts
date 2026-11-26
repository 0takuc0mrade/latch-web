import { DemoError } from "./adapter";
import { stroopsToXlm, xlmToStroops } from "./constants";

/**
 * The 150 XLM send in chapter 04 needs at least this much in the account. The
 * hosted fund route's bridge fallback only sends 10 XLM, so a smaller balance
 * means funding did not really work (PR_NOTES.md item 12).
 */
export const MIN_DEMO_BALANCE_STROOPS = xlmToStroops(150);

/** Throws a `funding_failed` DemoError when the balance cannot run the demo. */
export function assertDemoBalance(balanceStroops: bigint): void {
  if (balanceStroops >= MIN_DEMO_BALANCE_STROOPS) return;

  const have = stroopsToXlm(balanceStroops).toLocaleString("en-US", { maximumFractionDigits: 7 });
  throw new DemoError(
    "funding_failed",
    `Your account only has ${have} test XLM, and the demo needs at least 150. Nothing was sent. Try getting test XLM again.`,
  );
}
