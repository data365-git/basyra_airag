import { NextResponse } from "next/server";
import { PORTAL_COOKIE } from "@/lib/portalAuth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(PORTAL_COOKIE);
  return response;
}
