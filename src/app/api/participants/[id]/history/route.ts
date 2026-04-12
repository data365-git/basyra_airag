import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const enrollments = await prisma.trainingParticipant.findMany({
    where: { participantId: id },
    include: {
      training: {
        select: { id: true, name: true, color: true, status: true, startDate: true, endDate: true },
      },
    },
  });

  const result: Record<string, unknown>[] = [];

  for (const e of enrollments) {
    const sessions = await prisma.session.findMany({
      where: { trainingId: e.trainingId },
      orderBy: { sessionNumber: "asc" },
    });

    const attendance = await prisma.attendance.findMany({
      where: {
        participantId: id,
        sessionId: { in: sessions.map((s) => s.id) },
      },
    });

    const attMap = new Map(attendance.map((a) => [a.sessionId, a]));

    result.push({
      trainingId: e.trainingId,
      training: {
        id: e.training.id,
        name: e.training.name,
        color: e.training.color,
        status: e.training.status,
        start_date: e.training.startDate.toISOString().slice(0, 10),
        end_date: e.training.endDate.toISOString().slice(0, 10),
      },
      sessions: sessions.map((s) => {
        const rec = attMap.get(s.id);
        return {
          id: s.id,
          session_number: s.sessionNumber,
          session_date: s.sessionDate,
          status: s.status,
          record: rec
            ? {
                id: rec.id,
                status: rec.status,
                note: rec.note,
                scanned_at: rec.scannedAt,
              }
            : null,
        };
      }),
    });
  }

  return NextResponse.json(result);
}
