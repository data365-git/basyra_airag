import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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
      session_date: session.sessionDate,
      session_time: session.sessionTime,
      status: session.status,
      training: {
        id: session.training.id,
        name: session.training.name,
        color: session.training.color,
      },
      records,
    });
  } catch (e) {
    console.error("session GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const session = await prisma.session.findUnique({
      where: { id },
      include: { _count: { select: { attendance: true } } },
    });
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const attendanceCount = session._count.attendance;

    // Delete attendance records first, then the session
    if (attendanceCount > 0) {
      await prisma.attendanceAudit.deleteMany({
        where: { attendance: { sessionId: id } },
      });
      await prisma.attendance.deleteMany({ where: { sessionId: id } });
    }
    await prisma.session.delete({ where: { id } });

    return NextResponse.json({ deleted: true, attendanceCount });
  } catch (e) {
    console.error("session DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
