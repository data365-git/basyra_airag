import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";
import { generateSessionDates } from "@/lib/utils";

export async function GET() {
  const trainings = await prisma.training.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      trainingParticipants: { select: { participantId: true } },
      sessions: { select: { id: true } },
    },
  });

  return NextResponse.json(
    trainings.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      color: t.color,
      icon: t.icon,
      start_date: t.startDate.toISOString().slice(0, 10),
      end_date: t.endDate.toISOString().slice(0, 10),
      schedule_day: t.scheduleDay,
      schedule_time: t.scheduleTime,
      status: t.status,
      attendance_threshold: t.attendanceThreshold,
      created_by: t.createdById,
      created_at: t.createdAt,
      participant_count: t.trainingParticipants.length,
      session_count: t.sessions.length,
    }))
  );
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, color, icon, start_date, end_date, schedule_day, schedule_time, attendance_threshold } = body;

  const training = await prisma.training.create({
    data: {
      name,
      description,
      color: color || "#3B82F6",
      icon: icon || "book",
      startDate: new Date(start_date),
      endDate: new Date(end_date),
      scheduleDay: schedule_day,
      scheduleTime: schedule_time,
      attendanceThreshold: attendance_threshold || 80,
      createdById: user.sub,
    },
  });

  const sessionDates = generateSessionDates(start_date, end_date, schedule_day);
  if (sessionDates.length > 0) {
    await prisma.session.createMany({
      data: sessionDates.map((date, i) => ({
        trainingId: training.id,
        sessionNumber: i + 1,
        sessionDate: date,
        sessionTime: schedule_time,
        status: new Date() > date ? "closed" : "upcoming",
      })),
    });
  }

  return NextResponse.json(training, { status: 201 });
}
