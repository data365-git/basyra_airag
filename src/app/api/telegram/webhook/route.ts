/**
 * POST /api/telegram/webhook
 * Telegram sends every update here. Must be registered via /api/telegram/set-webhook.
 */

import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { getBot } from "@/lib/bot";

export const dynamic = "force-dynamic";

// grammy's webhookCallback returns a standard Request→Response handler
let handler: ((req: Request) => Promise<Response>) | null = null;

function getHandler() {
  if (handler) return handler;
  const bot = getBot();
  handler = webhookCallback(bot, "std/http");
  return handler;
}

export async function POST(req: NextRequest) {
  try {
    return await getHandler()(req);
  } catch (err: any) {
    console.error("[Telegram webhook]", err?.message);
    return NextResponse.json({ ok: false }, { status: 200 }); // always 200 to Telegram
  }
}
