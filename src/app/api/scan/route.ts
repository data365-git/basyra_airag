import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { resolveLateThreshold, computeAttendanceStatus } from "@/lib/lateDetection";
import { getSessionState } from "@/lib/sessionWindow";
import { loadSystemWindowSettings } from "@/lib/sessionWindow.server";

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token: string, sessionId: string, scannedAt: string | undefined;
  try {
    const body = await request.json();
    token      = body.token;
    sessionId  = body.sessionId;
    scannedAt  = body.scannedAt; // ISO string — for offline sync validation
  } catch {
    return NextResponse.json({ type: "unknown", message: "Invalid request body" }, { status: 400 });
  }

  if (!token || !sessionId) {
    return NextResponse.json({ type: "unknown", message: "Missing token or session" }, { status: 400 });
  }

  try {
    // ── 1. Resolve participant ───────────────────────────────────────────────
    const participant = await prisma.participant.findUnique({
      where: { qrToken: token },
    });

    if (!participant) {
      return NextResponse.json({ type: "unknown", message: "QR not recognized" });
    }

    // ── 2. Resolve session ───────────────────────────────────────────────────
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        training: {
          select: {
            lateThresholdMinutes: true,
            scheduleTime: true,
            scanWindowBefore: true,
            scanWindowAfter: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ type: "unknown", message: "Session not found" });
    }

    // ── 3. Determine effective scan time ─────────────────────────────────────
    // For offline scans, the client sends `scannedAt` (original device time).
    // We validate the scan window against the ORIGINAL scan time, not now.
    const scanTime = scannedAt ? new Date(scannedAt) : new Date();

    // ── 4. Check session state ───────────────────────────────────────────────
    const settings = await loadSystemWindowSettings();
    const windowInput = {
      sessionDate:      session.sessionDate,
      sessionTime:      session.sessionTime,
      isCancelled:      session.isCancelled,
      forceClosed:      session.forceClosed,
      scanWindowBefore: session.training.scanWindowBefore,
      scanWindowAfter:  session.training.scanWindowAfter,
    };

    const state = getSessionState(windowInput, settings, scanTime);

    if (state === "cancelled") {
      return NextResponse.json({ type: "session_cancelled", message: "Session has been cancelled", participant });
    }
    if (state === "force_closed") {
      return NextResponse.json({ type: "force_closed", message: "Session was closed by admin", participant });
    }
    if (state === "upcoming") {
      return NextResponse.json({ type: "not_started", message: "Scan window not open yet", participant });
    }
    if (state === "ended") {
      return NextResponse.json({ type: "window_closed", message: "Scan window has closed", participant });
    }
    // state === "active" — proceed

    // ── 5. Check enrollment ──────────────────────────────────────────────────
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

    // ── 6. Duplicate check ───────────────────────────────────────────────────
    const existing = await prisma.attendance.findUnique({
      where: {
        sessionId_participantId: {
          sessionId,
          participantId: participant.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ type: "already_recorded", message: "Already marked present", participant });
    }

    // ── 7. Compute late status ────────────────────────────────────────────────
    const sessionDateStr = session.sessionDate.toISOString().slice(0, 10);
    const threshold = await resolveLateThreshold(session.training.lateThresholdMinutes);
    const { status, minutesLate } = computeAttendanceStatus(
      scanTime,
      sessionDateStr,
      session.training.scheduleTime,
      threshold
    );

    // ── 8. Record attendance ─────────────────────────────────────────────────
    const isOfflineSync = !!scannedAt;
    await prisma.attendance.create({
      data: {
        sessionId,
        participantId: participant.id,
        status,
        method:           "qr",
        scannedAt:        scanTime,
        scannedById:      user.id,
        syncedFromOffline: isOfflineSync,
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
