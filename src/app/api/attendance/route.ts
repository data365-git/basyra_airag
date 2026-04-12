import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get("training_id");
  const sessionId = searchParams.get("session_id");

  const records = await prisma.attendance.findMany({
    where: {
      ...(sessionId ? { sessionId } : {}),
      ...(trainingId ? { session: { trainingId } } : {}),
    },
  });

  return NextResponse.json(
    records.map((r) => ({
      id: r.id,
      session_id: r.sessionId,
      participant_id: r.participantId,
      status: r.status,
      scanned_at: r.scannedAt,
      note: r.note,
      override_by: r.overrideById,
      override_at: r.overrideAt,
      synced_from_offline: r.syncedFromOffline,
    }))
  );
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { session_id, participant_id, status, note } = body;

  const record = await prisma.attendance.create({
    data: {
      sessionId: session_id,
      participantId: participant_id,
      status,
      method: "manual",
      note: note || null,
      scannedById: user.sub,
    },
  });

  return NextResponse.json({
    id: record.id,
    session_id: record.sessionId,
    participant_id: record.participantId,
    status: record.status,
    note: record.note,
  }, { status: 201 });
}
