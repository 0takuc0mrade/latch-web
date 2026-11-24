import type { NextConfig } from "next";

/**
 * Optional same-origin proxy for /demo's live adapter: /latch-api/* is
 * forwarded to latch-api, so the browser only talks to this site. latch-api's
 * `sid` session cookie is then first-party (no CORS allow-list or Safari
 * third-party-cookie problem). Off unless LATCH_API_PROXY_TARGET is set;
 * pair it with NEXT_PUBLIC_DEMO_API_URL=/latch-api. See PR_NOTES.md.
 */
const latchApiProxyTarget = process.env.LATCH_API_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.154"],
  async rewrites() {
    return latchApiProxyTarget ? [{ source: "/latch-api/:path*", destination: `${latchApiProxyTarget}/:path*` }] : [];
  },
};

export default nextConfig;
