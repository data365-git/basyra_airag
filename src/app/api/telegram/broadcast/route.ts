import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const user  = token ? await verifyJWT(token) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { participantIds, message } = body;

  if (!message?.trim() || !Array.isArray(participantIds) || participantIds.length === 0) {
    return NextResponse.json({ error: "message and participantIds required" }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: "Bot not configured" }, { status: 503 });

  const links = await prisma.telegramLink.findMany({
    where: { participantId: { in: participantIds } },
    select: { chatId: true },
  });

  let sent = 0;
  for (const link of links) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chat_id: Number(link.chatId), text: message.trim(), parse_mode: "HTML" }),
      });
      sent++;
    } catch {
      // skip failed sends
    }
  }

  return NextResponse.json({ sent, total: links.length });
}
