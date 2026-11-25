import type { NextConfig } from "next";
import { resolveLatchApiProxyTarget } from "./lib/demo/local-backend";

/**
 * Same-origin proxy for /demo's live adapter: /latch-api/* is forwarded to
 * latch-api, so the browser only talks to this site and latch-api's `sid`
 * session cookie is first-party (no CORS allow-list or Safari third-party-cookie
 * problem). Defaults to the testnet-capable latch-api; LATCH_API_PROXY_TARGET
 * overrides it, and under `next dev` NEXT_PUBLIC_DEMO_LOCAL_BACKEND=1 points it
 * at a latch-api on this machine (lib/demo/local-backend.ts). See PR_NOTES.md.
 */
const latchApiProxyTarget = resolveLatchApiProxyTarget(process.env);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.154"],
  async rewrites() {
    return [{ source: "/latch-api/:path*", destination: `${latchApiProxyTarget}/:path*` }];
  },
};

export default nextConfig;
