import { DemoError, type DemoAdapter } from "./adapter";
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

/** PLACEHOLDER: the live adapter (latch-api, Friendbot, Soroban RPC) is not built yet. */
function createLiveAdapterPlaceholder(): DemoAdapter {
  const notReady = () =>
    Promise.reject(
      new DemoError("network_unavailable", "The live demo isn't connected yet. Nothing was created."),
    );
  return {
    mode: "live",
    createAccount: notReady,
    restoreSession: () => Promise.resolve(null),
    getAccountState: notReady,
    fund: notReady,
    installSpendingRule: notReady,
    send: notReady,
    getReceipt: notReady,
    reset: () => Promise.resolve(),
  };
}

export function createDemoAdapter(): DemoAdapter {
  return getDemoAdapterMode() === "live" ? createLiveAdapterPlaceholder() : new MockDemoAdapter();
}
