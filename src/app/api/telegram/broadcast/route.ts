import { NextRequest, NextResponse } from "next/server";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";
import { POST as chatbotBroadcastPOST } from "@/app/api/chatbot/broadcast/route";

type TelegramBroadcastResponse = {
  sent?: number;
  total?: number;
};

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const user = token ? await verifyJWT(token) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { participantIds, message } = body;

  if (
    typeof message !== "string" ||
    !message.trim() ||
    !Array.isArray(participantIds) ||
    participantIds.length === 0
  ) {
    return NextResponse.json({ error: "message and participantIds required" }, { status: 400 });
  }

  const trimmedMessage = message.trim();
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  headers.set("x-telegram-broadcast-compat", "1");

  // Compatibility endpoint: keep the old request/response contract while the
  // chatbot broadcast route owns recipient lookup, Telegram delivery, and history.
  const delegated = await chatbotBroadcastPOST(
    new NextRequest(req.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: trimmedMessage,
        participantIds,
        type: "legacy_telegram",
      }),
    })
  );

  if (!delegated) {
    return NextResponse.json({ error: "Broadcast failed" }, { status: 500 });
  }

  const data = (await delegated.json().catch(() => ({}))) as TelegramBroadcastResponse;
  if (!delegated.ok) {
    return NextResponse.json(data, { status: delegated.status });
  }

  return NextResponse.json({
    sent: data.sent ?? 0,
    total: data.total ?? 0,
  });
}
