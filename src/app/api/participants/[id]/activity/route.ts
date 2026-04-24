import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getFullUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const scores = await prisma.activityScore.findMany({
    where: { participantId: id },
    include: {
      session: {
        include: { training: { select: { id: true, name: true, color: true } } },
      },
      enteredBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const count = scores.length;
  const avg_score = count > 0 ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / count) : null;

  return NextResponse.json({
    count,
    avg_score,
    scores: scores.map((s) => ({
      session_date: s.session.sessionDate,
      session_number: s.session.sessionNumber,
      training_name: s.session.training.name,
      training_color: s.session.training.color,
      score: s.score,
      note: s.note ?? null,
      entered_by: s.enteredBy?.name ?? null,
    })),
  });
}
