import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { parseChatId, serializeTelegramMessage } from "../_utils";

export const dynamic = "force-dynamic";

type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
  result?: {
    message_id?: number;
  };
};

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "participants", "edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chatIdRaw = typeof body === "object" && body !== null && "chatId" in body
    ? String(body.chatId)
    : "";
  const text = typeof body === "object" && body !== null && "text" in body && typeof body.text === "string"
    ? body.text.trim()
    : "";
  const chatId = parseChatId(chatIdRaw);

  if (chatId == null) return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId.toString(),
      text,
    }),
  });

  const telegramJson = await telegramResponse.json().catch(() => null) as TelegramSendMessageResponse | null;
  if (!telegramResponse.ok || !telegramJson?.ok) {
    return NextResponse.json({
      error: "Telegram sendMessage failed",
      detail: telegramJson?.description ?? telegramResponse.statusText,
    }, { status: 502 });
  }

  const link = await prisma.telegramLink.findFirst({
    where: { chatId },
    select: { participantId: true },
    orderBy: { linkedAt: "desc" },
  });

  const saved = await prisma.telegramMessage.create({
    data: {
      chatId,
      participantId: link?.participantId ?? null,
      direction: "out",
      text,
      messageType: "text",
      telegramMsgId: telegramJson.result?.message_id ?? null,
    },
  });

  return NextResponse.json({ message: serializeTelegramMessage(saved) });
}
