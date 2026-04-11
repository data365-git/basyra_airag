import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { resolveLateThreshold, computeAttendanceStatus } from "@/lib/lateDetection";

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token: string, sessionId: string;
  try {
    const body = await request.json();
    token = body.token;
    sessionId = body.sessionId;
  } catch {
    return NextResponse.json({ type: "unknown", message: "Invalid request body" }, { status: 400 });
  }

  if (!token || !sessionId) {
    return NextResponse.json({ type: "unknown", message: "Missing token or session" }, { status: 400 });
  }

  try {
    const participant = await prisma.participant.findUnique({
      where: { qrToken: token },
    });

    if (!participant) {
      return NextResponse.json({ type: "unknown", message: "QR not recognized" });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { training: { select: { lateThresholdMinutes: true, scheduleTime: true } } },
    });

    if (!session) {
      return NextResponse.json({ type: "unknown", message: "Session not found" });
    }

    // Only allow scans when the session is actively open (not upcoming or closed)
    if (session.status !== "open") {
      return NextResponse.json({ type: "session_closed", message: "Session is not open", participant });
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

    const scannedAt = new Date();
    const threshold = await resolveLateThreshold(session.training.lateThresholdMinutes);
    const sessionDateStr = session.sessionDate.toISOString().slice(0, 10);
    const { status, minutesLate } = computeAttendanceStatus(
      scannedAt,
      sessionDateStr,
      session.training.scheduleTime,
      threshold
    );

    await prisma.attendance.create({
      data: {
        sessionId,
        participantId: participant.id,
        status,
        scannedAt,
        scannedById: user.id,
      },
    });

    if (status === "late") {
      return NextResponse.json({ type: "late", message: "Marked late", participant, minutesLate });
    }
    return NextResponse.json({ type: "success", message: "Marked present", participant });
  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json({ type: "unknown", message: "Server error, please try again" }, { status: 500 });
  }
}
