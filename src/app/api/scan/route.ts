import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { resolveLateThreshold, computeAttendanceStatus } from "@/lib/lateDetection";
import { getTodayInTashkent } from "@/lib/sessionWindow";

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token: string, sessionId: string, scannedAt: string | undefined, forceOverride: boolean;
  try {
    const body = await request.json();
    token         = body.token;
    sessionId     = body.sessionId;
    scannedAt     = body.scannedAt;      // ISO string — for offline sync validation
    forceOverride = body.forceOverride === true;
  } catch {
    return NextResponse.json({ type: "unknown", message: "Invalid request body" }, { status: 400 });
  }

  if (!token || !sessionId) {
    return NextResponse.json({ type: "unknown", message: "Missing token or session" }, { status: 400 });
  }

  try {
    // ── 1. Resolve participant ───────────────────────────────────────────────
    const participantRaw = await prisma.participant.findUnique({
      where: { qrToken: token },
    });

    if (!participantRaw) {
      return NextResponse.json({ type: "unknown", message: "QR not recognized", participant: null });
    }

    // Normalize to snake_case so frontend Participant type (full_name, photo_url) matches.
    // Prisma returns camelCase (fullName, photoUrl) which would crash ScanResultOverlay.
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
          select: {
            lateThresholdMinutes: true,
            scheduleTime: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ type: "unknown", message: "Session not found", participant });
    }

    // ── 3. Determine effective scan time ─────────────────────────────────────
    const scanTime = scannedAt ? new Date(scannedAt) : new Date();

    // ── 4. Check session state ───────────────────────────────────────────────
    // A session is scannable any time on its calendar day (Asia/Tashkent).
    // No time-based window — late vs. present is computed below from scan time.

    if (session.isCancelled) {
      return NextResponse.json({ type: "session_cancelled", message: "Session has been cancelled", participant });
    }
    if (session.forceClosed) {
      return NextResponse.json({ type: "force_closed", message: "Session was closed by admin", participant });
    }

    const todayTashkent = getTodayInTashkent(scanTime);
    if (session.sessionDate !== todayTashkent) {
      if (session.sessionDate > todayTashkent) {
        return NextResponse.json({ type: "not_started", message: "Session not scheduled yet", participant });
      }
      return NextResponse.json({ type: "window_closed", message: "Session was on a different day", participant });
    }
    // Same calendar day — proceed

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

    const sessionDateStr = session.sessionDate;
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
      const { status: existingStatus } = existing;
      const existingMethod = existing.method || "system";

      // ── Excused — hard block, admin decision QR cannot override ──────────
      if (existingStatus === "excused") {
        return NextResponse.json({
          type: "excused",
          message: "Participant is excused for this session",
          participant,
        });
      }

      // ── System-generated absent → silent QR override, no confirmation ────
      // The bulk-generator writes method:"system" before any scan.
      // No human set this deliberately — override without asking.
      if (existingMethod === "system" && existingStatus === "absent") {
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
              reason:       "QR scan (system absent override)",
            },
          });
        });
        if (newStatus === "late") {
          return NextResponse.json({ type: "late", message: "Marked late", participant, minutesLate });
        }
        return NextResponse.json({ type: "success", message: "Marked present", participant });
      }

      // ── Any other existing status → pause for operator confirmation ───────
      //
      // Covers: present (qr/manual), late (qr/manual), absent (manual).
      // A prior scan or human decision set this record deliberately.
      // Return full context so the confirmation sheet can show current → new.
      if (!forceOverride) {
        return NextResponse.json(
          {
            type:              "needs_confirmation",
            participant,
            existingStatus,
            existingMethod,
            existingScannedAt: existing.scannedAt?.toISOString() ?? null,
            newStatus,          // what this rescan would set it to
          },
          { status: 409 }
        );
      }

      // ── forceOverride === true → operator confirmed, write update ─────────
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
            reason:       `QR force override (was ${existingMethod} ${existingStatus})`,
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
