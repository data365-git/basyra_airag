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

    // ── 6. Attendance state machine ──────────────────────────────────────────
    //
    // An existing record does NOT automatically mean "block."
    // We check method + status to decide whether to block, update, or create.
    //
    // | status   | method          | what to do                              |
    // |----------|-----------------|------------------------------------------|
    // | present  | qr              | Block — true duplicate scan             |
    // | late     | qr              | Block — true duplicate scan             |
    // | present  | manual          | Block — admin already confirmed present  |
    // | excused  | any             | Block — admin decision, QR cannot win    |
    // | absent   | system/manual   | UPDATE — QR scan overrides absent        |
    // | absent   | qr (legacy)     | UPDATE — treat as overridable            |
    // | <none>   | —               | CREATE — first scan                     |

    const sessionDateStr = session.sessionDate.toISOString().slice(0, 10);
    const threshold = await resolveLateThreshold(session.training.lateThresholdMinutes);
    const { status: newStatus, minutesLate } = computeAttendanceStatus(
      scanTime,
      sessionDateStr,
      session.training.scheduleTime,
      threshold
    );

    const existing = await prisma.attendance.findUnique({
      where: {
        sessionId_participantId: { sessionId, participantId: participant.id },
      },
    });

    if (existing) {
      const { status: existingStatus, method: existingMethod } = existing;

      // ── True QR duplicate — person already physically scanned ────────────
      if (
        (existingStatus === "present" || existingStatus === "late") &&
        existingMethod === "qr"
      ) {
        return NextResponse.json({
          type: "already_recorded",
          message: "Already scanned",
          participant,
          scannedAt: existing.scannedAt,
        });
      }

      // ── Admin already marked present manually — don't overwrite ──────────
      if (existingStatus === "present" && existingMethod === "manual") {
        return NextResponse.json({
          type: "already_recorded",
          message: "Already marked present by administrator",
          participant,
        });
      }

      // ── Excused — admin decision, QR cannot override ──────────────────────
      if (existingStatus === "excused") {
        return NextResponse.json({
          type: "excused",
          message: "Participant is excused for this session",
          participant,
        });
      }

      // ── Absent (system auto-fill, manual admin, or legacy) — QR wins ──────
      // Update the existing record in-place; write audit trail.
      const isOfflineSync = !!scannedAt;

      await prisma.$transaction(async (tx) => {
        await tx.attendance.update({
          where: { id: existing.id },
          data: {
            status:            newStatus,
            method:            "qr",
            scannedAt:         scanTime,
            scannedById:       user.id,
            syncedFromOffline: isOfflineSync,
            overrideById:      null,
            overrideAt:        null,
            note:              null,
          },
        });

        await tx.attendanceAudit.create({
          data: {
            attendanceId: existing.id,
            changedById:  user.id,
            oldStatus:    existing.status,
            newStatus,
            reason:       `QR scan override (was ${existing.method ?? "unknown"})`,
          },
        });
      });

      if (newStatus === "late") {
        return NextResponse.json({ type: "late", message: "Marked late (override)", participant, minutesLate });
      }
      return NextResponse.json({ type: "success", message: "Marked present (override)", participant });
    }

    // ── 7. No existing record — create fresh ─────────────────────────────────
    const isOfflineSync = !!scannedAt;
    const newRecord = await prisma.attendance.create({
      data: {
        sessionId,
        participantId: participant.id,
        status:            newStatus,
        method:            "qr",
        scannedAt:         scanTime,
        scannedById:       user.id,
        syncedFromOffline: isOfflineSync,
      },
    });

    await prisma.attendanceAudit.create({
      data: {
        attendanceId: newRecord.id,
        changedById:  user.id,
        oldStatus:    null,
        newStatus,
        reason:       "QR scan",
      },
    });

    if (newStatus === "late") {
      return NextResponse.json({ type: "late", message: "Marked late", participant, minutesLate });
    }
    return NextResponse.json({ type: "success", message: "Marked present", participant });

  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json({ type: "unknown", message: "Server error, please try again" }, { status: 500 });
  }
}
