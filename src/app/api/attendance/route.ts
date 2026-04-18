import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

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
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { session_id, participant_id, status, note } = body;

  const record = await prisma.attendance.create({
    data: {
      sessionId: session_id,
      participantId: participant_id,
      status,
      method: "manual",
      note: note || null,
      scannedById: user.id,
      overrideById: user.id,
      overrideAt: new Date(),
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

export async function PATCH(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as
      | {
          session_id?: string;
          participant_ids?: string[];
          status?: "present" | "late" | "absent" | "excused";
          note?: string | null;
        }
      | null;

    const sessionId = body?.session_id?.trim();
    const participantIds = Array.isArray(body?.participant_ids)
      ? body.participant_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    const status = body?.status;
    const note = body?.note ?? null;

    if (!sessionId || participantIds.length === 0 || !status) {
      return NextResponse.json({ error: "session_id, participant_ids, and status are required" }, { status: 400 });
    }

    const uniqueParticipantIds = [...new Set(participantIds)];
    const now = new Date();

    const existingRecords = await prisma.attendance.findMany({
      where: {
        sessionId,
        participantId: { in: uniqueParticipantIds },
      },
    });
    const existingByParticipant = new Map(existingRecords.map((record) => [record.participantId, record]));

    const participantNames = await prisma.participant.findMany({
      where: { id: { in: uniqueParticipantIds } },
      select: { id: true, fullName: true },
    });
    const participantNameById = new Map(participantNames.map((participant) => [participant.id, participant.fullName]));

    let updated = 0;
    let created = 0;

    for (const participantId of uniqueParticipantIds) {
      const current = existingByParticipant.get(participantId);

      if (current) {
        const record = await prisma.attendance.update({
          where: { id: current.id },
          data: {
            status,
            method: "manual",
            note,
            overrideById: user.id,
            overrideAt: now,
          },
        });
        updated++;

        if (current.status !== status) {
          void prisma.attendanceAudit.create({
            data: {
              attendanceId: record.id,
              changedById: user.id,
              oldStatus: current.status,
              newStatus: status,
              reason: "Manual admin batch override",
            },
          }).catch((err) => console.error("[ATTENDANCE BATCH] audit write failed (non-fatal):", err));
        }
        continue;
      }

      const record = await prisma.attendance.create({
        data: {
          sessionId,
          participantId,
          status,
          method: "manual",
          note,
          scannedById: user.id,
          overrideById: user.id,
          overrideAt: now,
        },
      });
      created++;

      void prisma.attendanceAudit.create({
        data: {
          attendanceId: record.id,
          changedById: user.id,
          oldStatus: null,
          newStatus: status,
          reason: "Manual admin batch create",
        },
      }).catch((err) => console.error("[ATTENDANCE BATCH] audit write failed (non-fatal):", err));
    }

    return NextResponse.json({
      ok: true,
      updated,
      created,
      participant_count: uniqueParticipantIds.length,
      participant_names: uniqueParticipantIds.map((id) => participantNameById.get(id) ?? id),
    });
  } catch (error) {
    console.error("attendance batch PATCH error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
