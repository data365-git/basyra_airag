import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chatId: chatIdStr } = await params;
  let chatIdBig: bigint;
  try {
    chatIdBig = BigInt(chatIdStr);
  } catch {
    return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
  }

  const messages = await prisma.botMessage.findMany({
    where: { chatId: chatIdBig },
    include: { rating: { select: { stars: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Derive participantId from messages (first non-null wins)
  const participantId = messages.find((m) => m.participantId)?.participantId ?? null;

  const participant = participantId
    ? await prisma.participant.findUnique({
        where: { id: participantId },
        select: { id: true, fullName: true },
      })
    : null;

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      created_at: m.createdAt.toISOString(),
      rating: m.rating ? { stars: m.rating.stars } : null,
    })),
    participant: participant
      ? { id: participant.id, full_name: participant.fullName }
      : null,
  });
}
