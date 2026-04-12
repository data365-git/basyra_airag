import { NextResponse } from "next/server";

/**
 * GET/HEAD /api/health
 *
 * Zero-dependency health check — no auth, no DB.
 * Used by the scanner page to verify actual server reachability
 * before deciding whether a scan goes online or to the offline queue.
 * Must respond in < 200 ms.
 */
export async function GET() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Health": "ok",
    },
  });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Health": "ok",
    },
  });
}
