/**
 * Client-readable demo configuration. Direct `process.env.NEXT_PUBLIC_*` reads
 * so Next inlines them at build time. Every value has a working default.
 */

/** Friendbot: funds a testnet C-address directly with 10,000 test XLM and allows browser requests. */
export const DEMO_FRIENDBOT_URL = (process.env.NEXT_PUBLIC_DEMO_FRIENDBOT_URL ?? "https://friendbot.stellar.org").replace(/\/+$/, "");

/** The demo's own API (app/api/demo/*): same origin, as in latch-playground. */
export const DEMO_API_URL = "/api/demo";

/** Soroban RPC, only for reading a transaction's status (receipts). */
export const DEMO_RPC_URL = (process.env.NEXT_PUBLIC_DEMO_RPC_URL || "https://soroban-testnet.stellar.org").replace(/\/+$/, "");

/** Stellar testnet's passphrase. The demo is testnet-only. */
export const TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

/**
 * The host production serves the demo from (e.g. demo.uselatch.app), so its
 * passkeys never share uselatch.app with the wallet's. Unset on previews and
 * in local dev, where the demo runs on whatever host serves it.
 */
export const DEMO_HOST = process.env.NEXT_PUBLIC_DEMO_HOST?.trim() || null;

/** The Latch wallet's passkey RP ID: the demo never creates passkeys there. */
export const WALLET_RP_ID = "uselatch.app";

/** Stellar Expert (testnet) contract link, for "View on Stellar Expert". */
export const DEMO_EXPLORER_CONTRACT_URL = "https://stellar.expert/explorer/testnet/contract";

/** Stellar Expert (testnet) account link, for the recipient. */
export const DEMO_EXPLORER_ACCOUNT_URL = "https://stellar.expert/explorer/testnet/account";

/** Stellar Expert (testnet) transaction link. */
export const DEMO_EXPLORER_TX_URL = "https://stellar.expert/explorer/testnet/tx";

/** Where the live demo runs; off that host the hero links here. */
export const DEMO_LIVE_URL = `https://${DEMO_HOST ?? "demo.uselatch.app"}/demo`;

/**
 * Can the live demo run on this page? Passkeys need a secure context (https,
 * or localhost). With DEMO_HOST set, only that host; never the wallet's own
 * uselatch.app, whose passkeys belong to the Latch app.
 */
export function isPasskeyHost(hostname: string, protocol: string, demoHost: string | null = DEMO_HOST): boolean {
  if (demoHost) return hostname === demoHost && protocol === "https:";
  if (hostname === WALLET_RP_ID) return false;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}
