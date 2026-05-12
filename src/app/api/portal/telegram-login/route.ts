/**
 * POST /api/portal/telegram-login
 *
 * Browser fallback: handles the Telegram Login Widget callback.
 * The widget sends a signed user object — we verify the HMAC, then look
 * up the participant via TelegramLink and create a portal session cookie.
 *
 * Telegram Login Widget verification (different from Mini App initData):
 * https://core.telegram.org/widgets/login#checking-authorization
 *
 * 1. Collect all fields except `hash` as "key=value" lines, sorted by key
 * 2. dataCheckString = sorted lines joined with "\n"
 * 3. secret = SHA256(BOT_TOKEN)  ← NOT HMAC, plain SHA256
 * 4. expectedHash = HMAC-SHA256(dataCheckString, secret)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHash, createHmac } from "crypto";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { signPortalJWT, PORTAL_COOKIE } from "@/lib/portalAuth";

interface TelegramLoginUser {
  id:         number;
  first_name: string;
  last_name?: string;
  username?:  string;
  photo_url?: string;
  auth_date:  number;
  hash:       string;
}

export async function POST(req: NextRequest) {
  const user: TelegramLoginUser = await req.json().catch(() => null);
  if (!user?.hash || !user?.id || !user?.auth_date) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";

  // ── 1. Verify HMAC ────────────────────────────────────────────────────────
  const { hash, ...fields } = user;
  const checkString = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret       = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secret).update(checkString).digest("hex");

  if (expectedHash !== hash) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // ── 2. Check auth_date freshness (within 24 h) ────────────────────────────
  if (Date.now() / 1000 - user.auth_date > 86400) {
    return NextResponse.json({ error: "expired" }, { status: 401 });
  }

  // ── 3. Look up participant via TelegramLink ───────────────────────────────
  const chatId = BigInt(user.id);
  const link   = await prisma.telegramLink.findFirst({
    where:   { chatId },
    include: { participant: true },
  });

  if (!link) {
    return NextResponse.json({ error: "not_linked" }, { status: 403 });
  }

  // ── 4. Create portal session cookie ──────────────────────────────────────
  const jwt = await signPortalJWT({
    sub:      link.participantId,
    username: link.participant.fullName,
  });

  const jar = await cookies();
  jar.set(PORTAL_COOKIE, jwt, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true, name: link.participant.fullName });
}
