import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const training = await prisma.training.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { sessionNumber: "asc" } },
      trainingParticipants: {
        include: {
          participant: { select: { id: true, fullName: true, phone: true, email: true, qrToken: true } },
        },
      },
    },
  });

  if (!training) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: training.id,
    name: training.name,
    description: training.description,
    color: training.color,
    icon: training.icon,
    start_date: training.startDate.toISOString().slice(0, 10),
    end_date: training.endDate.toISOString().slice(0, 10),
    schedule_day: training.scheduleDay,
    schedule_time: training.scheduleTime,
    status: training.status,
    attendance_threshold: training.attendanceThreshold,
    created_by: training.createdById,
    created_at: training.createdAt,
    sessions: training.sessions.map((s) => ({
      id: s.id,
      session_number: s.sessionNumber,
      session_date: s.sessionDate.toISOString().slice(0, 10),
      session_time: s.sessionTime,
      status: s.status,
    })),
    participants: training.trainingParticipants.map((tp) => ({
      participant: {
        id: tp.participant.id,
        full_name: tp.participant.fullName,
        phone: tp.participant.phone,
        email: tp.participant.email,
        qr_token: tp.participant.qrToken,
      },
    })),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.color !== undefined) data.color = body.color;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.status !== undefined) data.status = body.status;
  if (body.attendance_threshold !== undefined) data.attendanceThreshold = body.attendance_threshold;
  if (body.start_date !== undefined) data.startDate = new Date(body.start_date);
  if (body.end_date !== undefined) data.endDate = new Date(body.end_date);
  if (body.schedule_day !== undefined) data.scheduleDay = body.schedule_day;
  if (body.schedule_time !== undefined) data.scheduleTime = body.schedule_time;

  const training = await prisma.training.update({ where: { id }, data });
  return NextResponse.json(training);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "delete"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.training.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
