import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;

  const stars = searchParams.get("stars");
  const reason = searchParams.get("reason");
  const status = searchParams.get("status");
  const trainingId = searchParams.get("trainingId");
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const PAGE_SIZE = 50;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Build participant filter for trainingId
  let participantIdFilter: { in: string[] } | undefined;
  if (trainingId) {
    const tps = await prisma.trainingParticipant.findMany({
      where: { trainingId },
      select: { participantId: true },
    });
    participantIdFilter = { in: tps.map((tp) => tp.participantId) };
  }

  const where = {
    ratedAt: { gte: since },
    ...(stars ? { stars: parseInt(stars, 10) } : {}),
    ...(reason ? { reason } : {}),
    ...(status ? { status } : {}),
    ...(participantIdFilter ? { participantId: participantIdFilter } : {}),
  };

  const [ratings, total, agg] = await Promise.all([
    prisma.botMessageRating.findMany({
      where,
      include: {
        message: {
          select: { content: true, intent: true, routedTo: true, chatId: true, createdAt: true },
        },
        participant: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: "asc" }, { stars: "asc" }, { ratedAt: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.botMessageRating.count({ where }),
    prisma.botMessageRating.aggregate({
      where,
      _avg: { stars: true },
      _count: { _all: true },
    }),
  ]);

  const newCount = await prisma.botMessageRating.count({
    where: { ...where, status: "new" },
  });

  return NextResponse.json({
    ratings: ratings.map((r) => ({
      id: r.id,
      stars: r.stars,
      reason: r.reason,
      comment: r.comment,
      status: r.status,
      rated_at: r.ratedAt.toISOString(),
      curated_at: r.curatedAt?.toISOString() ?? null,
      question: r.message.content.slice(0, 200),
      message_id: r.messageId,
      participant_name: r.participant?.fullName ?? null,
      participant_id: r.participantId ?? null,
    })),
    total,
    stats: {
      avg_stars: agg._avg.stars ?? null,
      new_count: newCount,
    },
  });
}
