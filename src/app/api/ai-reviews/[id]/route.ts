import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const rating = await prisma.botMessageRating.findUnique({
    where: { id },
    include: {
      message: true,
      participant: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  });

  if (!rating) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Last 5 turns of the conversation up to and including the rated message
  const context = await prisma.botMessage.findMany({
    where: {
      chatId: rating.message.chatId,
      createdAt: { lte: rating.message.createdAt },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      role: true,
      content: true,
      intent: true,
      routedTo: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    rating: {
      id: rating.id,
      stars: rating.stars,
      reason: rating.reason,
      comment: rating.comment,
      status: rating.status,
      rated_at: rating.ratedAt.toISOString(),
      curated_at: rating.curatedAt?.toISOString() ?? null,
      curated_by_id: rating.curatedById ?? null,
    },
    question: rating.message.content,
    message: {
      id: rating.message.id,
      role: rating.message.role,
      intent: rating.message.intent,
      routed_to: rating.message.routedTo,
      chat_id: rating.message.chatId.toString(),
      created_at: rating.message.createdAt.toISOString(),
    },
    participant: rating.participant
      ? {
          id: rating.participant.id,
          full_name: rating.participant.fullName,
          phone: rating.participant.phone ?? null,
          email: rating.participant.email ?? null,
        }
      : null,
    context: context.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      intent: m.intent,
      routed_to: m.routedTo,
      created_at: m.createdAt.toISOString(),
    })),
  });
}
