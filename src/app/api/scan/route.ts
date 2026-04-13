import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { resolveLateThreshold, computeAttendanceStatus } from "@/lib/lateDetection";
import { getTodayInTashkent } from "@/lib/sessionWindow";

// ── Audit helper ──────────────────────────────────────────────────────────────
// Audit writes are best-effort — a failed audit must NEVER roll back the
// attendance record. We log errors but do not throw.
async function writeAudit(data: {
  attendanceId: string;
  changedById:  string;
  oldStatus:    string | null;
  newStatus:    string;
  reason:       string;
}) {
  try {
    await prisma.attendanceAudit.create({ data });
  } catch (err) {
    console.error("[SCAN] audit write failed (non-fatal):", err);
  }
}

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token: string, sessionId: string, scannedAt: string | undefined;
  try {
    const body  = await request.json();
    token     = body.token;
    sessionId = body.sessionId;
    scannedAt = body.scannedAt;     // ISO string — for offline sync
  } catch {
    return NextResponse.json({ type: "unknown", message: "Invalid request body" }, { status: 400 });
  }

  if (!token || !sessionId) {
    return NextResponse.json({ type: "unknown", message: "Missing token or session" }, { status: 400 });
  }

  console.log(`[SCAN] token=${token.slice(0, 8)}… sessionId=${sessionId}`);

  try {
    // ── 1. Resolve participant ───────────────────────────────────────────────
    const participantRaw = await prisma.participant.findUnique({
      where: { qrToken: token },
    });

    if (!participantRaw) {
      console.log("[SCAN] participant not found");
      return NextResponse.json({ type: "unknown", message: "QR not recognized", participant: null });
    }

    const participant = {
      id:        participantRaw.id,
      full_name: participantRaw.fullName,
      photo_url: participantRaw.photoUrl ?? null,
      qr_token:  participantRaw.qrToken,
    };

    // ── 2. Resolve session ───────────────────────────────────────────────────
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        training: {
          select: { lateThresholdMinutes: true, scheduleTime: true },
        },
      },
    });

    if (!session) {
      console.log(`[SCAN] session not found id=${sessionId}`);
      return NextResponse.json({
        type:    "unknown",
        message: `Session not found (id: ${sessionId})`,
        participant,
      });
    }

    // ── 3. Determine effective scan time ─────────────────────────────────────
    const scanTime = scannedAt ? new Date(scannedAt) : new Date();

    // ── 4. Check session state ───────────────────────────────────────────────
    if (session.isCancelled) {
      return NextResponse.json({ type: "session_cancelled", message: "Session has been cancelled", participant });
    }
    if (session.forceClosed) {
      return NextResponse.json({ type: "force_closed", message: "Session was closed by admin", participant });
    }

    const todayTashkent = getTodayInTashkent(scanTime);
    if (session.sessionDate !== todayTashkent) {
      console.log(`[SCAN] date mismatch session=${session.sessionDate} today=${todayTashkent}`);
      if (session.sessionDate > todayTashkent) {
        return NextResponse.json({ type: "not_started", message: "Session not scheduled yet", participant });
      }
      return NextResponse.json({ type: "window_closed", message: "Session was on a different day", participant });
    }

    // ── 5. Check enrollment ──────────────────────────────────────────────────
    const enrollment = await prisma.trainingParticipant.findUnique({
      where: {
        trainingId_participantId: {
          trainingId:    session.trainingId,
          participantId: participant.id,
        },
      },
    });

    if (!enrollment) {
      return NextResponse.json({ type: "not_enrolled", message: "Not enrolled in this training", participant });
    }

    // ── 6. Compute new status ────────────────────────────────────────────────
    const sessionDateStr = session.sessionDate;
    const threshold = await resolveLateThreshold(session.training.lateThresholdMinutes);
    const { status: newStatus, minutesLate } = computeAttendanceStatus(
      scanTime,
      sessionDateStr,
      session.training.scheduleTime,
      threshold
    );

    // ── 7. Attendance state machine ──────────────────────────────────────────
    //
    // | existing status | method | action                         |
    // |-----------------|--------|--------------------------------|
    // | —               | —      | CREATE (first scan)            |
    // | excused         | any    | BLOCK (admin decision, QR loses)|
    // | any other       | any    | UPDATE immediately from QR     |

    const existing = await prisma.attendance.findUnique({
      where: {
        sessionId_participantId: { sessionId, participantId: participant.id },
      },
    });

    // ── No existing record — first scan ──────────────────────────────────────
    if (!existing) {
      const isOfflineSync = !!scannedAt;
      const newRecord = await prisma.attendance.create({
        data: {
          sessionId,
          participantId:     participant.id,
          status:            newStatus,
          method:            "qr",
          scannedAt:         scanTime,
          scannedById:       user.id,
          syncedFromOffline: isOfflineSync,
        },
      });
      console.log(`[SCAN] created attendance id=${newRecord.id} status=${newStatus}`);

      // Audit is best-effort — failure does NOT affect the response
      await writeAudit({
        attendanceId: newRecord.id,
        changedById:  user.id,
        oldStatus:    null,
        newStatus,
        reason:       "QR scan",
      });

      return NextResponse.json({
        type:       newStatus === "late" ? "late" : "success",
        message:    newStatus === "late" ? "Marked late" : "Marked present",
        participant,
        minutesLate,
        scannedAt:  scanTime.toISOString(),
      });
    }

    // ── Excused — hard block ──────────────────────────────────────────────────
    if (existing.status === "excused") {
      return NextResponse.json({
        type:    "excused",
        message: "Participant is excused for this session",
        participant,
      });
    }

    // ── Any other existing status → overwrite immediately from QR ─────────────
    const isOfflineSync = !!scannedAt;
    await prisma.attendance.update({
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
    console.log(`[SCAN] updated attendance → ${newStatus} id=${existing.id} (was ${existing.method ?? "system"} ${existing.status})`);

    await writeAudit({
      attendanceId: existing.id,
      changedById:  user.id,
      oldStatus:    existing.status,
      newStatus,
      reason:       `QR scan overwrite (was ${existing.method ?? "system"} ${existing.status})`,
    });

    return NextResponse.json({
      type:       newStatus === "late" ? "late" : "success",
      message:    newStatus === "late" ? "Marked late" : "Marked present",
      participant,
      minutesLate,
      scannedAt:  scanTime.toISOString(),
    });

  } catch (err) {
    console.error("[SCAN] unhandled error:", err);
    return NextResponse.json(
      { type: "unknown", message: "Server error, please try again" },
      { status: 500 }
    );
  }
}
