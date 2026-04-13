/**
 * POST /api/portal/telegram-login
 *
 * Verifies the Telegram Login Widget payload using HMAC-SHA256,
 * matches it against TelegramLink, and creates a portal session.
 *
 * Telegram docs: https://core.telegram.org/widgets/login#checking-authorization
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHmac, createHash } from "crypto";
import prisma from "@/lib/prisma";
import { signPortalJWT, PORTAL_COOKIE } from "@/lib/portalAuth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { hash, ...data } = body as Record<string, string | number>;

  // 1. Verify Telegram hash
  const botToken  = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const secretKey = createHash("sha256").update(botToken).digest();
  const checkStr  = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  const expectedHash = createHmac("sha256", secretKey).update(checkStr).digest("hex");

  if (expectedHash !== hash) {
    return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 });
  }

  // 2. Check auth_date is fresh (within 24 h)
  const authDate = Number(data.auth_date);
  if (Date.now() / 1000 - authDate > 86400) {
    return NextResponse.json({ error: "Auth token expired" }, { status: 401 });
  }

  // 3. Look up TelegramLink by chatId
  const chatId = BigInt(data.id as number);
  const link   = await prisma.telegramLink.findFirst({
    where:   { chatId },
    include: { participant: true },
  });

  if (!link) {
    return NextResponse.json({ error: "not_linked" }, { status: 403 });
  }

  // 4. Create portal JWT and set cookie
  const token = await signPortalJWT({
    sub:      link.participantId,
    username: link.participant.fullName,
  });

  const jar = await cookies();
  jar.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ ok: true });
}
