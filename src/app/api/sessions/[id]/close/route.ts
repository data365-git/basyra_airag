import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await prisma.session.update({
    where: { id },
    data: { status: "closed" },
  });

  // Get enrolled participants
  const enrolled = await prisma.trainingParticipant.findMany({
    where: { trainingId: session.trainingId },
    select: { participantId: true },
  });

  // Get already-marked attendance
  const existing = await prisma.attendance.findMany({
    where: { sessionId: id },
    select: { participantId: true },
  });

  const existingIds = new Set(existing.map((r) => r.participantId));
  const missingIds = enrolled
    .map((e) => e.participantId)
    .filter((pid) => !existingIds.has(pid));

  if (missingIds.length > 0) {
    await prisma.attendance.createMany({
      data: missingIds.map((participantId) => ({
        sessionId: id,
        participantId,
        status: "absent",
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ success: true, marked_absent: missingIds.length });
}
