import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Group BotMessages by chatId to get conversation stats
  const grouped = await prisma.botMessage.groupBy({
    by: ["chatId", "participantId"],
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
  });

  // Collect unique participantIds for name lookups
  const participantIds = [...new Set(
    grouped.map((g) => g.participantId).filter((id): id is string => id !== null)
  )];

  const [participants, telegramLinks] = await Promise.all([
    participantIds.length > 0
      ? prisma.participant.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    participantIds.length > 0
      ? prisma.telegramLink.findMany({
          where: { participantId: { in: participantIds } },
          select: { participantId: true, verifiedPhone: true },
        })
      : Promise.resolve([]),
  ]);

  const nameById = new Map(participants.map((p) => [p.id, p.fullName]));
  const phoneById = new Map(telegramLinks.map((tl) => [tl.participantId, tl.verifiedPhone]));

  // Apply search filter (by name or chatId)
  let filtered = grouped;
  if (search) {
    const lower = search.toLowerCase();
    filtered = grouped.filter((g) => {
      const name = g.participantId ? nameById.get(g.participantId) ?? "" : "";
      return (
        name.toLowerCase().includes(lower) ||
        g.chatId.toString().includes(lower)
      );
    });
  }

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  const users = page.map((g) => ({
    chat_id: g.chatId.toString(),
    participant_id: g.participantId ?? null,
    full_name: g.participantId ? (nameById.get(g.participantId) ?? null) : null,
    phone: g.participantId ? (phoneById.get(g.participantId) ?? null) : null,
    message_count: g._count.id,
    last_message_at: g._max.createdAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ users, total });
}
