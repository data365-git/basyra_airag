import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SUPERVISOR_COOKIE } from "@/lib/supervisorAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(SUPERVISOR_COOKIE);
  return NextResponse.json({ ok: true });
}
