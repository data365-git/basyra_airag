import { Bot } from "grammy";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { message } = body as { message: string; type?: string };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Get all TelegramLink chat_ids (no isActive field in schema — all links are active)
  const links = await prisma.telegramLink.findMany({
    select: { chatId: true },
  });

  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token) return NextResponse.json({ error: "Bot token not configured" }, { status: 500 });

  const bot = new Bot(token);
  let sent = 0;
  let failed = 0;

  for (const link of links) {
    try {
      await bot.api.sendMessage(Number(link.chatId), message, { parse_mode: "HTML" });
      sent++;
    } catch {
      failed++;
    }
    // 40ms delay between sends ≈ 25 msg/sec, well under Telegram's 30 msg/sec limit
    await new Promise((r) => setTimeout(r, 40));
  }

  return NextResponse.json({ sent, failed, total: links.length });
}
