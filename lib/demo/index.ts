import { type DemoAdapter } from "./adapter";
import { isPasskeyHost, DEMO_API_URL, DEMO_EXPLORER_TX_URL, DEMO_FRIENDBOT_URL, DEMO_RPC_URL } from "./config";
import { LiveDemoAdapter } from "./live-adapter";
import { MockDemoAdapter } from "./mock-adapter";

export * from "./adapter";
export * from "./config";
export * from "./constants";
export * from "./funding";
export * from "./progress";

/** Query parameter for "Try a simulated walkthrough" (hosts where passkeys can't work). */
export const SIMULATED_PARAM = "simulated";

/**
 * Adapter selection: live by default. The mock is opt-in only:
 * NEXT_PUBLIC_DEMO_ADAPTER=mock; (outside production builds) any `?mock`
 * query parameter, e.g. `?mock` or `?mock=cancel-send`; or `?simulated` on a
 * host where the live demo can't run (e.g. uselatch.app itself), which is what "Try a
 * simulated walkthrough" opens. On the demo's own host `?simulated` is
 * ignored, so production stays live only.
 */
export function resolveDemoAdapterMode(input: {
  envAdapter: string | undefined;
  search: string;
  nodeEnv: string | undefined;
  /** isPasskeyHost for the current page; defaults to true (no simulated option). */
  passkeyHost?: boolean;
}): "mock" | "live" {
  if (input.envAdapter === "mock") return "mock";
  const params = new URLSearchParams(input.search);
  if (input.nodeEnv !== "production" && params.has("mock")) return "mock";
  if (input.passkeyHost === false && params.has(SIMULATED_PARAM)) return "mock";
  return "live";
}

export function getDemoAdapterMode(): "mock" | "live" {
  return resolveDemoAdapterMode({
    envAdapter: process.env.NEXT_PUBLIC_DEMO_ADAPTER,
    search: typeof window === "undefined" ? "" : window.location.search,
    nodeEnv: process.env.NODE_ENV,
    passkeyHost: typeof window === "undefined" ? true : isPasskeyHost(window.location.hostname, window.location.protocol),
  });
}

export function createDemoAdapter(): DemoAdapter {
  if (getDemoAdapterMode() === "mock") return new MockDemoAdapter();
  return new LiveDemoAdapter({
    apiUrl: DEMO_API_URL,
    friendbotUrl: DEMO_FRIENDBOT_URL,
    rpcUrl: DEMO_RPC_URL,
    explorerTxUrl: DEMO_EXPLORER_TX_URL,
  });
}
