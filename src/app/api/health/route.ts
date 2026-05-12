import { NextResponse } from "next/server";

/**
 * GET/HEAD /api/health
 *
 * Zero-dependency health check — no auth, no DB.
 * Used by the scanner page to verify actual server reachability
 * before deciding whether a scan goes online or to the offline queue.
 * Must respond in < 200 ms.
 */
// Bump this string with every deploy to verify the correct version is live
const BUILD_VERSION = "2026-04-12-v5";

export async function GET() {
  return NextResponse.json(
    { ok: true, version: BUILD_VERSION },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Health": "ok",
      "X-Version": BUILD_VERSION,
    },
  });
}
