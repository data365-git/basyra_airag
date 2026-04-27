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

  const [telegramMessages, botMessages, telegramLink] = await Promise.all([
    prisma.telegramMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.botMessage.findMany({
      where: { chatId },
      include: { rating: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.telegramLink.findFirst({
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
    }),
  ]);

  const messages = [
    ...telegramMessages.map(serializeTelegramMessage),
    ...botMessages.map(serializeBotMessage),
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
  });
}
