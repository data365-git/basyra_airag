import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { training: { select: { id: true, name: true, color: true } } },
  });

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get attendance records with participant info and override user
  const attendance = await prisma.attendance.findMany({
    where: { sessionId: id },
    include: {
      participant: { select: { id: true, fullName: true, phone: true } },
      overrideBy: { select: { id: true, name: true } },
    },
  });

  // Get enrolled participants not yet in attendance
  const enrolled = await prisma.trainingParticipant.findMany({
    where: { trainingId: session.trainingId },
    include: { participant: { select: { id: true, fullName: true, phone: true } } },
  });

  const attendedIds = new Set(attendance.map((r) => r.participantId));
  const pending = enrolled
    .filter((e) => !attendedIds.has(e.participantId))
    .map((e) => ({
      id: `pending-${e.participant.id}`,
      session_id: id,
      participant_id: e.participant.id,
      status: "pending",
      participant: {
        id: e.participant.id,
        full_name: e.participant.fullName,
        phone: e.participant.phone,
      },
      scanned_at: null,
      note: null,
    }));

  const records = [
    ...attendance.map((r) => ({
      id: r.id,
      session_id: r.sessionId,
      participant_id: r.participantId,
      status: r.status,
      participant: {
        id: r.participant.id,
        full_name: r.participant.fullName,
        phone: r.participant.phone,
      },
      scanned_at: r.scannedAt,
      note: r.note,
      override_by_name: r.overrideBy?.name ?? null,
      override_at: r.overrideAt ? r.overrideAt.toISOString() : null,
    })),
    ...pending,
  ].sort((a, b) => {
    const nameA = a.participant?.full_name ?? "";
    const nameB = b.participant?.full_name ?? "";
    return nameA.localeCompare(nameB);
  });

  return NextResponse.json({
    id: session.id,
    training_id: session.trainingId,
    session_number: session.sessionNumber,
    session_date: session.sessionDate.toISOString().slice(0, 10),
    session_time: session.sessionTime,
    status: session.status,
    training: {
      id: session.training.id,
      name: session.training.name,
      color: session.training.color,
    },
    records,
  });
}
