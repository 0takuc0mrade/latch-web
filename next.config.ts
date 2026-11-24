import type { NextConfig } from "next";

/**
 * Same-origin proxy for /demo's live adapter: /latch-api/* is forwarded to
 * latch-api, so the browser only talks to this site and latch-api's `sid`
 * session cookie is first-party (no CORS allow-list or Safari third-party-cookie
 * problem). Defaults to the testnet-capable latch-api; LATCH_API_PROXY_TARGET
 * overrides it. See PR_NOTES.md.
 */
const latchApiProxyTarget = (process.env.LATCH_API_PROXY_TARGET || "https://latch-api-bd7l.onrender.com").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.154"],
  async rewrites() {
    return [{ source: "/latch-api/:path*", destination: `${latchApiProxyTarget}/:path*` }];
  },
};

export default nextConfig;
