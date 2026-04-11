import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Never serve the scanner page or scan API from cache — they need live headers
  // and real-time server responses; stale cache breaks camera permission + attendance recording
  exclude: [/\/scanner/],
  runtimeCaching: [
    {
      // /api/scan must NEVER be cached — each scan must hit the server
      urlPattern: /\/api\/scan/,
      handler: "NetworkOnly",
    },
    {
      // Other API routes: network-first, short TTL
      urlPattern: /\/api\//,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 300 },
        networkTimeoutSeconds: 10,
      },
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
