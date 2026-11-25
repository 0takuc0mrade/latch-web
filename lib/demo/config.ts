/**
 * Client-readable demo configuration. Direct `process.env.NEXT_PUBLIC_*` reads
 * so Next inlines them at build time. Every value has a working default, so
 * production needs no env setup; each one can be overridden.
 */
import { LOCAL_RP_ID, isLocalBackendEnabled, resolveDemoRpId } from "./local-backend";

/** Dev only: talk to a latch-api on this machine (lib/demo/local-backend.ts). Always false in production builds. */
export const DEMO_LOCAL_BACKEND = isLocalBackendEnabled({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DEMO_LOCAL_BACKEND: process.env.NEXT_PUBLIC_DEMO_LOCAL_BACKEND,
});

/** Friendbot: funds a testnet C-address directly with 10,000 test XLM and allows browser requests. */
export const DEMO_FRIENDBOT_URL = (process.env.NEXT_PUBLIC_DEMO_FRIENDBOT_URL ?? "https://friendbot.stellar.org").replace(/\/+$/, "");

/**
 * latch-api base URL for the live adapter (no trailing slash). Defaults to the
 * same-origin proxy, "/latch-api", which next.config.ts rewrites to latch-api
 * (LATCH_API_PROXY_TARGET, default https://latch-api-bd7l.onrender.com).
 */
export const DEMO_API_URL = (process.env.NEXT_PUBLIC_DEMO_API_URL || "/latch-api").replace(/\/+$/, "");

/**
 * Soroban RPC used to confirm accounts exist on testnet, read balances and
 * receipts. Falls back to latch's own variable name (NEXT_PUBLIC_RPC_URL).
 */
export const DEMO_RPC_URL = (
  process.env.NEXT_PUBLIC_DEMO_RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://soroban-testnet.stellar.org"
).replace(/\/+$/, "");

/** Stellar testnet's passphrase. The demo is testnet-only. */
export const TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

/**
 * latch's NEXT_PUBLIC_NETWORK_PASSPHRASE, if set. Like latch's demoServer(),
 * the live demo refuses to run unless it is testnet's.
 */
export const DEMO_NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || TESTNET_NETWORK_PASSPHRASE;

/** Passkey relying party. latch-api is configured for uselatch.app; ceremonies only work on that host (localhost with the dev-only local backend). */
export const DEMO_RP_ID = resolveDemoRpId({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DEMO_LOCAL_BACKEND: process.env.NEXT_PUBLIC_DEMO_LOCAL_BACKEND,
  // latch's name for the same setting (lib/webauthn-client.ts) is accepted too.
  NEXT_PUBLIC_DEMO_RP_ID: process.env.NEXT_PUBLIC_DEMO_RP_ID || process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || undefined,
});

/** Stellar Expert (testnet) contract link, for "View on Stellar Expert". */
export const DEMO_EXPLORER_CONTRACT_URL = "https://stellar.expert/explorer/testnet/contract";

/** Stellar Expert (testnet) account link, for the recipient. */
export const DEMO_EXPLORER_ACCOUNT_URL = "https://stellar.expert/explorer/testnet/account";

/** Stellar Expert (testnet) transaction link. */
export const DEMO_EXPLORER_TX_URL = "https://stellar.expert/explorer/testnet/tx";

/** The live demo's public home; off that host the hero links here. */
export const DEMO_LIVE_URL = "https://uselatch.app/demo";

/**
 * Passkeys for latch-api's RP ID only work over https on the RP ID's host or a
 * subdomain (e.g. demo.uselatch.app). Anywhere else (localhost, *.vercel.app
 * previews) the live demo can't run. The one exception is the dev-only local
 * backend, whose RP ID is localhost: http://localhost is a secure context.
 */
export function isPasskeyHost(hostname: string, protocol: string, rpId: string = DEMO_RP_ID, localBackend: boolean = DEMO_LOCAL_BACKEND): boolean {
  if (localBackend && rpId === LOCAL_RP_ID) return hostname === LOCAL_RP_ID;
  return protocol === "https:" && (hostname === rpId || hostname.endsWith(`.${rpId}`));
}
