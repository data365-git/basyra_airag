import { NextResponse } from "next/server";
import { r2MissingKeys } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/health/r2
 *
 * Returns R2 configuration status. Safe to call publicly — never leaks
 * variable values, only reports which names are present / absent.
 *
 * 200  { configured: true,  bucket: "basyra-lms", publicUrl: "https://..." }
 * 503  { configured: false, missing: ["R2_ACCOUNT_ID", "R2_PUBLIC_URL"], hint: "…" }
 */
export async function GET() {
  const missing = r2MissingKeys();

  if (missing.length > 0) {
    return NextResponse.json(
      {
        configured: false,
        missing,
        hint: `Add these to Railway → your web service → Variables: ${missing.join(", ")}`,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    configured: true,
    bucket:    process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL,
  });
}
