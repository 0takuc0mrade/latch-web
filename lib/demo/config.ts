/**
 * Client-readable demo configuration. Direct `process.env.NEXT_PUBLIC_*` reads
 * so Next inlines them at build time. All values are optional; the mock adapter
 * needs none of them.
 */

/**
 * Base URL of the app that hosts `/api/demo/fund` (the older playground app).
 * Unset until that deployment's URL is known: see PR_NOTES.md item 12.
 */
export const DEMO_FUND_URL = (process.env.NEXT_PUBLIC_DEMO_FUND_URL ?? "").replace(/\/+$/, "");

/**
 * latch-api base URL for the live adapter (no trailing slash). Unset means the
 * live adapter isn't configured. The testnet-capable deployment today is
 * https://latch-api-bd7l.onrender.com (PR_NOTES.md, live backend item).
 */
export const DEMO_API_URL = (process.env.NEXT_PUBLIC_DEMO_API_URL ?? "").replace(/\/+$/, "");

/** Soroban RPC used to confirm accounts exist on testnet and to read receipts. */
export const DEMO_RPC_URL = (process.env.NEXT_PUBLIC_DEMO_RPC_URL ?? "https://soroban-testnet.stellar.org").replace(/\/+$/, "");

/** Passkey relying party. latch-api is configured for uselatch.app; ceremonies only work on that host. */
export const DEMO_RP_ID = process.env.NEXT_PUBLIC_DEMO_RP_ID ?? "uselatch.app";

/** Stellar Expert (testnet) transaction link. */
export const DEMO_EXPLORER_TX_URL = "https://stellar.expert/explorer/testnet/tx";
