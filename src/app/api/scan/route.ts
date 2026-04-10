import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { token, sessionId } = await request.json();

  if (!token || !sessionId) {
    return NextResponse.json({ type: "unknown", message: "Missing token or session" }, { status: 400 });
  }

  const participant = await prisma.participant.findUnique({
    where: { qrToken: token },
  });

  if (!participant) {
    return NextResponse.json({ type: "unknown", message: "QR not recognized" });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return NextResponse.json({ type: "unknown", message: "Session not found" });
  }

  if (session.status === "closed") {
    return NextResponse.json({ type: "session_closed", message: "Session is closed", participant });
  }

  const enrollment = await prisma.trainingParticipant.findUnique({
    where: {
      trainingId_participantId: {
        trainingId: session.trainingId,
        participantId: participant.id,
      },
    },
  });

  if (!enrollment) {
    return NextResponse.json({ type: "not_enrolled", message: "Not enrolled in this training", participant });
  }

  const existing = await prisma.attendance.findUnique({
    where: {
      sessionId_participantId: {
        sessionId,
        participantId: participant.id,
      },
    },
  });

  if (existing) {
    return NextResponse.json({ type: "already_scanned", message: "Already marked present", participant });
  }

  await prisma.attendance.create({
    data: {
      sessionId,
      participantId: participant.id,
      status: "present",
      scannedAt: new Date(),
      scannedById: user.id,
    },
  });

  return NextResponse.json({ type: "success", message: "Marked present", participant });
}
