import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { parseChatId, serializeBotMessage, serializeLink, serializeTelegramMessage } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !hasPermission(user, "participants", "edit") &&
    !hasPermission(user, "chatbot", "conversations")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { chatId: rawChatId } = await params;
  const chatId = parseChatId(rawChatId);
  if (chatId == null) {
    return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
  }

  const errors: string[] = [];

  let telegramMessages: Awaited<ReturnType<typeof prisma.telegramMessage.findMany>> = [];
  try {
    telegramMessages = await prisma.telegramMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    console.error("[chat/threads] telegramMessages query failed", err);
    errors.push("telegram_messages");
  }

  let botMessages: Awaited<ReturnType<typeof prisma.botMessage.findMany<{ include: { rating: true } }>>> = [];
  try {
    botMessages = await prisma.botMessage.findMany({
      where: { chatId },
      include: { rating: true },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    console.error("[chat/threads] botMessages query failed", err);
    errors.push("bot_messages");
  }

  let telegramLink: Awaited<ReturnType<typeof prisma.telegramLink.findFirst<{
    include: { participant: { select: { id: true; fullName: true; phone: true; email: true; photoUrl: true } } };
  }>>> = null;
  try {
    telegramLink = await prisma.telegramLink.findFirst({
      where: { chatId },
      include: {
        participant: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            photoUrl: true,
          },
        },
      },
      orderBy: { linkedAt: "desc" },
    });
  } catch (err) {
    console.error("[chat/threads] telegramLink query failed", err);
    errors.push("telegram_link");
  }

  // Fetch per-message usage costs and correlate by messageId
  const usageMap = new Map<string, { costUsd: number | null; responseTimeMs: number | null; model: string | null }>();
  if (botMessages.length > 0) {
    try {
      const usageLogs = await prisma.botUsageLog.findMany({
        where: { messageId: { in: botMessages.map((m) => m.id) } },
        select: { messageId: true, costUsd: true, responseTimeMs: true, model: true },
      });
      for (const log of usageLogs) {
        if (log.messageId) {
          usageMap.set(log.messageId, {
            costUsd: log.costUsd != null ? Number(log.costUsd) : null,
            responseTimeMs: log.responseTimeMs,
            model: log.model,
          });
        }
      }
    } catch (err) {
      console.error("[chat/threads] botUsageLog query failed", err);
      errors.push("bot_usage_log");
    }
  }

  const messages = [
    ...telegramMessages.map(serializeTelegramMessage),
    ...botMessages.map((m) => serializeBotMessage(m, usageMap.get(m.id))),
  ].sort((a, b) => {
    const byDate = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (byDate !== 0) return byDate;
    return a.table.localeCompare(b.table);
  });

  return NextResponse.json({
    chat_id: chatId.toString(),
    ...serializeLink(telegramLink),
    messages,
    counts: {
      telegram_count: telegramMessages.length,
      bot_count: botMessages.length,
      total_count: messages.length,
    },
    partial: errors.length > 0,
    errors,
  });
}
