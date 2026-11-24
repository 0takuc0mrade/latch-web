/**
 * Client-readable demo configuration. Direct `process.env.NEXT_PUBLIC_*` reads
 * so Next inlines them at build time. All values are optional; the mock adapter
 * needs none of them.
 */

/** Friendbot: funds a testnet C-address directly with 10,000 test XLM and allows browser requests. */
export const DEMO_FRIENDBOT_URL = (process.env.NEXT_PUBLIC_DEMO_FRIENDBOT_URL ?? "https://friendbot.stellar.org").replace(/\/+$/, "");

/**
 * latch-api base URL for the live adapter (no trailing slash). Unset means the
 * live adapter isn't configured. With the same-origin proxy this is
 * "/latch-api" (next.config.ts, LATCH_API_PROXY_TARGET).
 */
export const DEMO_API_URL = (process.env.NEXT_PUBLIC_DEMO_API_URL ?? "").replace(/\/+$/, "");

/** Soroban RPC used to confirm accounts exist on testnet and to read receipts. */
export const DEMO_RPC_URL = (process.env.NEXT_PUBLIC_DEMO_RPC_URL ?? "https://soroban-testnet.stellar.org").replace(/\/+$/, "");

/** Passkey relying party. latch-api is configured for uselatch.app; ceremonies only work on that host. */
export const DEMO_RP_ID = process.env.NEXT_PUBLIC_DEMO_RP_ID ?? "uselatch.app";

/** Stellar Expert (testnet) transaction link. */
export const DEMO_EXPLORER_TX_URL = "https://stellar.expert/explorer/testnet/tx";
