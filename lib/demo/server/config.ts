/**
 * Server configuration for /demo's API routes (app/api/demo/*). This is the
 * latch-playground setup: the page and its API are one app, a bundler key
 * pays every fee, and passkeys belong to the host the demo runs on.
 *
 * Contract defaults are the testnet deployments latch-playground and
 * latch-api's testnet config both use (latch/.env.local, latch-api/.env.staging).
 */
import { Networks } from "@stellar/stellar-sdk";
import { SPENDING_LIMIT_POLICY_ADDRESS } from "../constants";

/** The Latch wallet's passkey RP ID. The demo must never register passkeys under it. */
export const WALLET_RP_ID = "uselatch.app";

export interface DemoServerConfig {
  rpcUrl: string;
  networkPassphrase: string;
  factoryAddress: string;
  webauthnVerifierAddress: string;
  policyAddress: string;
  /** Testnet secret key of the account that pays every fee (latch-playground's BUNDLER_SECRET). */
  bundlerSecret: string;
  /** Explicit passkey RP ID / origin. When unset, both come from the request's host (previews, localhost). */
  rpId?: string;
  origin?: string;
}

export class DemoConfigError extends Error {}

type Env = Record<string, string | undefined>;

export function readDemoServerConfig(env: Env = process.env): DemoServerConfig {
  const bundlerSecret = env.DEMO_BUNDLER_SECRET?.trim();
  if (!bundlerSecret) throw new DemoConfigError("DEMO_BUNDLER_SECRET is not set");
  return {
    rpcUrl: (env.DEMO_RPC_URL || "https://soroban-testnet.stellar.org").replace(/\/+$/, ""),
    // Testnet only, on purpose: nothing here can touch mainnet.
    networkPassphrase: Networks.TESTNET,
    factoryAddress: env.DEMO_FACTORY_ADDRESS || "CABA6ERCFZRZXZV5EYQCFB5AQMHMAIEOB5TCN7JWHMK3HWUZJCJNUZRR",
    webauthnVerifierAddress: env.DEMO_WEBAUTHN_VERIFIER_ADDRESS || "CDBBGLSWWHWK52REY7GK5HWAQGAJJ4GP5O75LOM3F4INN6W4KT6DPBVY",
    policyAddress: SPENDING_LIMIT_POLICY_ADDRESS,
    bundlerSecret,
    rpId: env.DEMO_WEBAUTHN_RP_ID?.trim() || undefined,
    origin: env.DEMO_WEBAUTHN_ORIGIN?.trim().replace(/\/+$/, "") || undefined,
  };
}

/**
 * Passkey RP ID and expected origin for a request. Explicit settings win
 * (production: demo.uselatch.app); otherwise the request's own host, as in
 * latch-playground, so previews and localhost work with real passkeys.
 * Refuses the wallet's RP ID so demo passkeys never sit next to wallet ones.
 */
export function resolveRelyingParty(request: Request, config: Pick<DemoServerConfig, "rpId" | "origin">): { rpId: string; origin: string } {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(/:$/, "");
  const rpId = config.rpId ?? host.split(":")[0];
  const origin = config.origin ?? `${proto}://${host}`;
  if (rpId === WALLET_RP_ID) {
    throw new DemoConfigError(`The demo can't use ${WALLET_RP_ID} for passkeys; serve it from its own host (e.g. demo.uselatch.app).`);
  }
  return { rpId, origin };
}
