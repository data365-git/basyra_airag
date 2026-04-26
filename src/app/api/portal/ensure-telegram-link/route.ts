/**
 * POST /api/portal/ensure-telegram-link
 *
 * Called by the portal page when it detects it's running inside Telegram Mini App.
 * Verifies the Mini App initData, extracts the Telegram chatId, and upserts a
 * TelegramLink row for the authenticated participant.
 *
 * This fixes the "Telegram akkauntingiz ulanmagan" error that occurs when:
 * - A user logged in via phone-token but their TelegramLink was later deleted
 *   (e.g., via /logout in the bot or admin deletion), while their 30-day JWT
 *   remains valid.
 * - The Mini App opens the portal for a user who never completed the bot flow.
 *
 * Auth: portal JWT (Bearer header or httpOnly cookie)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "crypto";
import prisma from "@/lib/prisma";
import { getPortalUser } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ── 1. Authenticate the portal session ────────────────────────────────────
  const portal = await getPortalUser(req);
  if (!portal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const initData: string | undefined = body?.initData;

  if (!initData) {
    return NextResponse.json({ error: "initData required" }, { status: 400 });
  }

  // ── 2. Verify Telegram Mini App HMAC ─────────────────────────────────────
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const params   = new URLSearchParams(initData);
  const hash     = params.get("hash");

  if (!hash) {
    return NextResponse.json({ error: "hash missing" }, { status: 400 });
  }

  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey    = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (expectedHash !== hash) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 3. Check auth_date freshness (24 h) ───────────────────────────────────
  const authDate = Number(params.get("auth_date") ?? "0");
  if (Date.now() / 1000 - authDate > 86400) {
    return NextResponse.json({ error: "Expired initData" }, { status: 401 });
  }

  // ── 4. Extract chatId from user JSON ─────────────────────────────────────
  const userJson = params.get("user");
  if (!userJson) return NextResponse.json({ error: "No user in initData" }, { status: 400 });

  let tgUser: { id: number; first_name?: string; username?: string };
  try {
    tgUser = JSON.parse(userJson);
  } catch {
    return NextResponse.json({ error: "Invalid user JSON" }, { status: 400 });
  }

  const chatId    = BigInt(tgUser.id);
  const firstName = tgUser.first_name ?? null;
  const username  = tgUser.username  ?? null;

  // ── 5. Upsert TelegramLink for this participant ───────────────────────────
  // This is safe to call repeatedly — it's idempotent. We don't overwrite
  // verifiedPhone or verifiedByContact (those require the contact-share flow).
  try {
    await prisma.telegramLink.upsert({
      where:  { participantId: portal.sub },
      update: { chatId, firstName, username },
      create: { participantId: portal.sub, chatId, firstName, username },
    });
  } catch (err) {
    // e.g., unique constraint on chatId if another participant already has it
    console.warn("[ensure-telegram-link] upsert failed:", err);
    return NextResponse.json({ error: "Link conflict" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
