/**
 * Dev-only switch: run /demo against a latch-api on this machine
 * (http://localhost:8090, WEBAUTHN_RP_ID=localhost) instead of the hosted one.
 *
 * Enabled only when NODE_ENV is exactly "development" (`next dev`) and
 * NEXT_PUBLIC_DEMO_LOCAL_BACKEND=1. `next build` sets NODE_ENV=production, so
 * production builds ignore the flag (tests/demo-local-backend.test.ts).
 * No imports: next.config.ts uses this file too.
 */

export const HOSTED_LATCH_API_URL = "https://latch-api-bd7l.onrender.com";
export const LOCAL_LATCH_API_URL = "http://localhost:8090";
export const HOSTED_RP_ID = "uselatch.app";
export const LOCAL_RP_ID = "localhost";

export interface DemoBackendEnv {
  NODE_ENV?: string;
  NEXT_PUBLIC_DEMO_LOCAL_BACKEND?: string;
  NEXT_PUBLIC_DEMO_RP_ID?: string;
  LATCH_API_PROXY_TARGET?: string;
}

export function isLocalBackendEnabled(env: DemoBackendEnv): boolean {
  return env.NODE_ENV === "development" && env.NEXT_PUBLIC_DEMO_LOCAL_BACKEND === "1";
}

/** Where next.config.ts forwards /latch-api/*. An explicit LATCH_API_PROXY_TARGET always wins. */
export function resolveLatchApiProxyTarget(env: DemoBackendEnv): string {
  const target = env.LATCH_API_PROXY_TARGET || (isLocalBackendEnabled(env) ? LOCAL_LATCH_API_URL : HOSTED_LATCH_API_URL);
  return target.replace(/\/+$/, "");
}

/** The passkey relying party the page asks for. */
export function resolveDemoRpId(env: DemoBackendEnv): string {
  if (isLocalBackendEnabled(env)) return LOCAL_RP_ID;
  return env.NEXT_PUBLIC_DEMO_RP_ID ?? HOSTED_RP_ID;
}
