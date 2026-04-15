/**
 * POST /api/portal/phone-token-login
 *
 * Exchanges a one-time phone login token (created by the bot after phone
 * number verification) for a portal session cookie.
 *
 * Token is deleted after first use and expires in 10 minutes.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { signPortalJWT, PORTAL_COOKIE } from "@/lib/portalAuth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token: string | undefined = body?.token;

  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const record = await prisma.phoneLoginToken.findUnique({
    where:   { token },
    include: { participant: true },
  });

  if (!record) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  if (record.expiresAt < new Date()) {
    // Clean up expired token
    await prisma.phoneLoginToken.delete({ where: { token } }).catch(() => null);
    return NextResponse.json({ error: "expired_token" }, { status: 401 });
  }

  // One-time use — delete immediately
  await prisma.phoneLoginToken.delete({ where: { token } }).catch(() => null);

  // Create portal session cookie
  const jwt = await signPortalJWT({
    sub:      record.participantId,
    username: record.participant.fullName,
  });

  const jar = await cookies();
  jar.set(PORTAL_COOKIE, jwt, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "none", // needed for Telegram Mini App cross-origin context
    path:     "/",
    maxAge:   60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true, name: record.participant.fullName });
}
