/**
 * POST /api/portal/telegram-miniapp-login
 *
 * Authenticates a Telegram Mini App session by verifying the
 * `initData` string that Telegram injects into window.Telegram.WebApp.initData.
 *
 * Verification per Telegram docs:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * 1. Split initData into key=value pairs
 * 2. Remove "hash" from pairs, sort remaining alphabetically, join with "\n"
 * 3. HMAC-SHA256(dataCheckString, HMAC-SHA256("WebAppData", BOT_TOKEN))
 * 4. Compare with provided hash
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "crypto";
import prisma from "@/lib/prisma";
import { signPortalJWT, PORTAL_COOKIE } from "@/lib/portalAuth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.initData) {
    return NextResponse.json({ error: "initData required" }, { status: 400 });
  }

  const initData: string = body.initData;
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";

  // ── 1. Parse into key-value pairs ────────────────────────────────────────
  const params = new URLSearchParams(initData);
  const hash   = params.get("hash");
  if (!hash) return NextResponse.json({ error: "hash missing" }, { status: 400 });

  // ── 2. Build check string ─────────────────────────────────────────────────
  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // ── 3. Verify HMAC ────────────────────────────────────────────────────────
  const secretKey    = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (expectedHash !== hash) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 4. Check auth_date freshness (within 24 h) ────────────────────────────
  const authDate = Number(params.get("auth_date") ?? "0");
  if (Date.now() / 1000 - authDate > 86400) {
    return NextResponse.json({ error: "Expired" }, { status: 401 });
  }

  // ── 5. Extract Telegram user ID ───────────────────────────────────────────
  const userJson = params.get("user");
  if (!userJson) return NextResponse.json({ error: "No user in initData" }, { status: 400 });

  let telegramUser: { id: number; first_name?: string; username?: string };
  try {
    telegramUser = JSON.parse(userJson);
  } catch {
    return NextResponse.json({ error: "Invalid user JSON" }, { status: 400 });
  }

  const chatId = BigInt(telegramUser.id);

  // ── 6. Look up TelegramLink ───────────────────────────────────────────────
  const link = await prisma.telegramLink.findFirst({
    where:   { chatId },
    include: { participant: true },
  });

  if (!link) {
    return NextResponse.json({ error: "not_linked" }, { status: 403 });
  }

  // ── 7. Create portal session ──────────────────────────────────────────────
  const token = await signPortalJWT({
    sub:      link.participantId,
    username: link.participant.fullName,
  });

  const jar = await cookies();
  jar.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "none", // required for Telegram Mini App cross-origin iframe
    path:     "/",
    maxAge:   60 * 60 * 24 * 30,
  });

  // Return token in body so Mini App can store in localStorage and use
  // as Authorization header (cookies are dropped in cross-origin webview).
  return NextResponse.json({
    ok:    true,
    name:  link.participant.fullName,
    token,
  });
}
