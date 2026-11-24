/**
 * Client-readable demo configuration. Direct `process.env.NEXT_PUBLIC_*` reads
 * so Next inlines them at build time. Every value has a working default, so
 * production needs no env setup; each one can be overridden.
 */

/** Friendbot: funds a testnet C-address directly with 10,000 test XLM and allows browser requests. */
export const DEMO_FRIENDBOT_URL = (process.env.NEXT_PUBLIC_DEMO_FRIENDBOT_URL ?? "https://friendbot.stellar.org").replace(/\/+$/, "");

/**
 * latch-api base URL for the live adapter (no trailing slash). Defaults to the
 * same-origin proxy, "/latch-api", which next.config.ts rewrites to latch-api
 * (LATCH_API_PROXY_TARGET, default https://latch-api-bd7l.onrender.com).
 */
export const DEMO_API_URL = (process.env.NEXT_PUBLIC_DEMO_API_URL || "/latch-api").replace(/\/+$/, "");

/** Soroban RPC used to confirm accounts exist on testnet and to read receipts. */
export const DEMO_RPC_URL = (process.env.NEXT_PUBLIC_DEMO_RPC_URL ?? "https://soroban-testnet.stellar.org").replace(/\/+$/, "");

/** Passkey relying party. latch-api is configured for uselatch.app; ceremonies only work on that host. */
export const DEMO_RP_ID = process.env.NEXT_PUBLIC_DEMO_RP_ID ?? "uselatch.app";

/** Stellar Expert (testnet) transaction link. */
export const DEMO_EXPLORER_TX_URL = "https://stellar.expert/explorer/testnet/tx";

/** The live demo's public home; off that host the hero links here. */
export const DEMO_LIVE_URL = "https://uselatch.app/demo";

/**
 * Passkeys for latch-api's RP ID only work over https on the RP ID's host or a
 * subdomain (e.g. demo.uselatch.app). Anywhere else (localhost, *.vercel.app
 * previews) the live demo can't run.
 */
export function isPasskeyHost(hostname: string, protocol: string, rpId: string = DEMO_RP_ID): boolean {
  return protocol === "https:" && (hostname === rpId || hostname.endsWith(`.${rpId}`));
}
