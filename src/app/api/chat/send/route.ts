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

async function sendToOne(
  token: string,
  chatId: bigint,
  text: string,
): Promise<{ ok: true; telegramMsgId: number | null } | { ok: false; error: string }> {
  const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId.toString(), text }),
  });

  const telegramJson = await telegramResponse.json().catch(() => null) as TelegramSendMessageResponse | null;
  if (!telegramResponse.ok || !telegramJson?.ok) {
    return { ok: false, error: telegramJson?.description ?? telegramResponse.statusText };
  }
  return { ok: true, telegramMsgId: telegramJson.result?.message_id ?? null };
}

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

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = "text" in body && typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  // Bulk send: { chat_ids: string[], text: string }
  if ("chat_ids" in body && Array.isArray(body.chat_ids)) {
    const rawIds = body.chat_ids as unknown[];
    const chatIds = rawIds.map((id) => parseChatId(String(id))).filter((id): id is bigint => id != null);

    if (chatIds.length === 0) {
      return NextResponse.json({ error: "No valid chat_ids provided" }, { status: 400 });
    }

    let sent = 0;
    const failed: Array<{ chat_id: string; error: string }> = [];

    await Promise.all(
      chatIds.map(async (chatId) => {
        const result = await sendToOne(token, chatId, text);
        if (!result.ok) {
          failed.push({ chat_id: chatId.toString(), error: result.error });
          return;
        }
        const link = await prisma.telegramLink.findFirst({
          where: { chatId },
          select: { participantId: true },
          orderBy: { linkedAt: "desc" },
        });
        await prisma.telegramMessage.create({
          data: {
            chatId,
            participantId: link?.participantId ?? null,
            direction: "out",
            text,
            messageType: "text",
            telegramMsgId: result.telegramMsgId,
          },
        });
        sent++;
      }),
    );

    return NextResponse.json({ ok: true, sent, failed });
  }

  // Single send: { chatId: string, text: string }
  const chatIdRaw = "chatId" in body ? String(body.chatId) : "";
  const chatId = parseChatId(chatIdRaw);
  if (chatId == null) return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });

  const result = await sendToOne(token, chatId, text);
  if (!result.ok) {
    return NextResponse.json({ error: "Telegram sendMessage failed", detail: result.error }, { status: 502 });
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
      telegramMsgId: result.telegramMsgId,
    },
  });

  return NextResponse.json({ message: serializeTelegramMessage(saved) });
}
