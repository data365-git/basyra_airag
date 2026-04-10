import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");

  if (!trainingId) return NextResponse.json({ error: "training_id required" }, { status: 400 });

  const [sessions, participants, records] = await Promise.all([
    prisma.session.findMany({
      where: { trainingId, status: "closed" },
      orderBy: { sessionNumber: "asc" },
    }),
    prisma.participant.findMany({
      where: { trainingParticipants: { some: { trainingId } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.attendance.findMany({
      where: { session: { trainingId } },
    }),
  ]);

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      session_number: s.sessionNumber,
      session_date: s.sessionDate.toISOString().slice(0, 10),
      status: s.status,
    })),
    participants: participants.map((p) => ({
      id: p.id,
      full_name: p.fullName,
    })),
    records: records.map((r) => ({
      id: r.id,
      session_id: r.sessionId,
      participant_id: r.participantId,
      status: r.status,
    })),
  });
}
