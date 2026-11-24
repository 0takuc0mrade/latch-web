import { DemoError, type DemoAdapter } from "./adapter";
import { DEMO_API_URL, DEMO_EXPLORER_TX_URL, DEMO_FUND_URL, DEMO_RP_ID, DEMO_RPC_URL } from "./config";
import { LiveDemoAdapter } from "./live-adapter";
import { MockDemoAdapter } from "./mock-adapter";

export * from "./adapter";
export * from "./config";
export * from "./constants";
export * from "./funding";
export * from "./progress";

/**
 * Adapter selection. `NEXT_PUBLIC_DEMO_ADAPTER=live` picks the live adapter,
 * anything else (including unset) is the mock. Vercel previews cannot do
 * passkeys, so mock is the safe default.
 */
export function getDemoAdapterMode(): "mock" | "live" {
  return process.env.NEXT_PUBLIC_DEMO_ADAPTER === "live" ? "live" : "mock";
}

/** Live mode without NEXT_PUBLIC_DEMO_API_URL: every action fails visibly ("not connected yet"). */
function createLiveAdapterPlaceholder(): DemoAdapter {
  const notReady = () =>
    Promise.reject(
      new DemoError("network_unavailable", "The live demo isn't connected yet. Nothing was created."),
    );
  return {
    mode: "live",
    createAccount: notReady,
    restoreSession: (options) => (options?.prompt ? notReady() : Promise.resolve(null)),
    getAccountState: notReady,
    fund: notReady,
    installSpendingRule: notReady,
    send: notReady,
    getReceipt: notReady,
    reset: () => Promise.resolve(),
  };
}

export function createDemoAdapter(): DemoAdapter {
  if (getDemoAdapterMode() !== "live") return new MockDemoAdapter();
  // Live needs at least the latch-api URL; without it, fail visibly instead of faking.
  if (!DEMO_API_URL) return createLiveAdapterPlaceholder();
  return new LiveDemoAdapter({
    apiUrl: DEMO_API_URL,
    fundUrl: DEMO_FUND_URL,
    rpcUrl: DEMO_RPC_URL,
    rpId: DEMO_RP_ID,
    explorerTxUrl: DEMO_EXPLORER_TX_URL,
  });
}
