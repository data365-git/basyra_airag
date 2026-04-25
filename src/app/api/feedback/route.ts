import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status   = searchParams.get("status") ?? "new";

  const items = await prisma.studentFeedback.findMany({
    where: {
      ...(category ? { category } : {}),
      status,
    },
    orderBy: [
      { severity: "asc" },  // HIGH first (alphabetically H < L < M... use manual sort in UI)
      { createdAt: "desc" },
    ],
    include: {
      participant: { select: { fullName: true } },
    },
    take: 100,
  });

  return NextResponse.json(
    items.map(item => ({
      id:           item.id,
      created_at:   item.createdAt.toISOString(),
      category:     item.category,
      severity:     item.severity,
      tags:         item.tags,
      message_text: item.messageText,
      status:       item.status,
      curator_note: item.curatorNote,
      participant_name: item.participant?.fullName ?? null,
      chat_id:      item.chatId.toString(),
    }))
  );
}
