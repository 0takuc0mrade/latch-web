import { type DemoAdapter } from "./adapter";
import { DEMO_API_URL, DEMO_EXPLORER_TX_URL, DEMO_FRIENDBOT_URL, DEMO_NETWORK_PASSPHRASE, DEMO_RP_ID, DEMO_RPC_URL } from "./config";
import { LiveDemoAdapter } from "./live-adapter";
import { MockDemoAdapter } from "./mock-adapter";

export * from "./adapter";
export * from "./config";
export * from "./constants";
export * from "./funding";
export * from "./progress";

/**
 * Adapter selection: live by default. The mock is opt-in only:
 * NEXT_PUBLIC_DEMO_ADAPTER=mock, or (outside production builds) any `?mock`
 * query parameter, e.g. `?mock` or `?mock=cancel-send`.
 */
export function resolveDemoAdapterMode(input: { envAdapter: string | undefined; search: string; nodeEnv: string | undefined }): "mock" | "live" {
  if (input.envAdapter === "mock") return "mock";
  if (input.nodeEnv !== "production" && new URLSearchParams(input.search).has("mock")) return "mock";
  return "live";
}

export function getDemoAdapterMode(): "mock" | "live" {
  return resolveDemoAdapterMode({
    envAdapter: process.env.NEXT_PUBLIC_DEMO_ADAPTER,
    search: typeof window === "undefined" ? "" : window.location.search,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function createDemoAdapter(): DemoAdapter {
  if (getDemoAdapterMode() === "mock") return new MockDemoAdapter();
  return new LiveDemoAdapter({
    apiUrl: DEMO_API_URL,
    friendbotUrl: DEMO_FRIENDBOT_URL,
    rpcUrl: DEMO_RPC_URL,
    rpId: DEMO_RP_ID,
    explorerTxUrl: DEMO_EXPLORER_TX_URL,
    networkPassphrase: DEMO_NETWORK_PASSPHRASE,
    // Only the same-origin proxy keeps latch-api's cookie on this site, where the route can clear it.
    resetSessionUrl: DEMO_API_URL.startsWith("/") ? "/api/demo/reset-session" : undefined,
  });
}
