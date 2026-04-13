/**
 * GET /api/telegram/set-webhook?secret=ADMIN_SECRET
 * Call this once after deploying to register the webhook URL with Telegram.
 * Protect it with an env var: WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token   = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL;

  if (!token)  return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  if (!appUrl) return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set"  }, { status: 500 });

  const webhookUrl = `${appUrl}/api/telegram/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
    }
  );
  const data = await res.json();

  return NextResponse.json({ webhookUrl, telegram: data });
}
