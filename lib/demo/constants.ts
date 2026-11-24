/** Shared demo parameters. Amounts are in stroops (1 XLM = 10_000_000 stroops). */

// BigInt() calls, not literals: the tsconfig target (ES2017) rejects `10n`.
export const STROOPS_PER_XLM = BigInt(10_000_000);

/** Demo spending rule: 100 XLM per ~24h (17_280 ledgers at ~5s each). */
export const DEMO_SPENDING_LIMIT_STROOPS = BigInt(1_000_000_000);
export const DEMO_PERIOD_LEDGERS = 17_280;

/** Balance Friendbot gives a fresh testnet account. */
export const FRIENDBOT_BALANCE_STROOPS = BigInt(10_000) * STROOPS_PER_XLM;

/** OZ `spending_limit` policy error: SpendingLimitExceeded. */
export const ERROR_SPENDING_LIMIT_EXCEEDED = 3221;

/**
 * Spending-limit policy contract on testnet (latch-contracts/docs/BUILD.md,
 * deployed 2026-09-03; confirmed live on testnet 2026-11-24). Fixed in code on
 * purpose: the live adapter installs exactly this policy with the limit and
 * period above.
 */
export const SPENDING_LIMIT_POLICY_ADDRESS = "CDK44EDWIUM6JTSAHPAMBFNMICGQLTBGUD3LAP7NF47Q6VBVUSPSCJIL";

/**
 * "Latch demo account": a testnet account created and funded with Friendbot
 * for this demo (2026-11-24); its secret was discarded, so it can only receive.
 */
export const DEMO_RECIPIENT_ADDRESS =
  process.env.NEXT_PUBLIC_DEMO_RECIPIENT_ADDRESS ?? "GBRTN33C4X3QJOJX7C3GOCHY4GMXWYLGMGIF74QA57QAO6UYQUBIT6FM";

/** Rough shape check for a pasted Stellar address (G… account or C… contract). */
export function looksLikeStellarAddress(value: string): boolean {
  return /^[GC][A-Z2-7]{55}$/.test(value.trim());
}

export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * Number(STROOPS_PER_XLM)));
}

export function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / Number(STROOPS_PER_XLM);
}

/** "CBX4…7Q2M" from a full contract address. */
export function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}
