import type { NextConfig } from "next";

/**
 * Production serves /demo from its own host (NEXT_PUBLIC_DEMO_HOST, e.g.
 * demo.uselatch.app), so demo passkeys never share uselatch.app with the
 * wallet's. Unset (previews, local dev): /demo runs on whatever host serves
 * it, and passkeys belong to that host, as in latch-playground.
 */
const demoHost = process.env.NEXT_PUBLIC_DEMO_HOST?.trim();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.154"],
  async redirects() {
    if (!demoHost) return [];
    return [
      { source: "/demo", missing: [{ type: "host", value: demoHost }], destination: `https://${demoHost}/demo`, permanent: false },
      { source: "/", has: [{ type: "host", value: demoHost }], destination: "/demo", permanent: false },
    ];
  },
};

export default nextConfig;
