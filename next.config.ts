import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Never cache the scanner page — it needs live camera permissions + real-time headers
  exclude: [/\/scanner/],
  runtimeCaching: [
    {
      // ALL /api/ routes must go directly to the network — no SW interception, no caching.
      // This prevents the SW from returning stale/fabricated responses for POST /api/scan
      // and ensures /api/health pings always reach the real server.
      urlPattern: /\/api\//,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /\/_next\/static\//,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
      },
    },
    {
      urlPattern: /\/_next\/image/,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "next-images" },
    },
  ],
});

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=*, microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
