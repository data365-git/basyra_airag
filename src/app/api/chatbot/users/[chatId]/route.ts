import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "chatbot", "conversations")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { chatId } = await params;

  const body = await request.json().catch(() => ({}));
  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "is_active (boolean) required" }, { status: 400 });
  }

  // Find TelegramLink by chatId (BigInt)
  let chatIdBig: bigint;
  try {
    chatIdBig = BigInt(chatId);
  } catch {
    return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
  }

  const link = await prisma.telegramLink.findFirst({
    where: { chatId: chatIdBig },
  });

  if (!link) {
    return NextResponse.json({ error: "TelegramLink not found" }, { status: 404 });
  }

  // TelegramLink has no is_active field — we toggle on the Participant instead
  await prisma.participant.update({
    where: { id: link.participantId },
    data: { isBlocked: !body.is_active },
  });

  return NextResponse.json({ ok: true, chat_id: chatId, is_active: body.is_active });
}
