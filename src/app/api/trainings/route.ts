import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { generateSessionDates } from "@/lib/utils";

const CreateTrainingSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  schedule_day: z.number().int().min(0).max(6),
  schedule_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  attendance_threshold: z.number().int().min(0).max(100).optional(),
}).refine(
  (d) => new Date(d.end_date) >= new Date(d.start_date),
  { message: "End date must be on or after start date", path: ["end_date"] }
);

export async function GET() {
  try {
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
  } catch (e) {
    console.error("trainings GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "create"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = CreateTrainingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, description, color, icon, start_date, end_date, schedule_day, schedule_time, attendance_threshold } = parsed.data;

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
        attendanceThreshold: attendance_threshold ?? 80,
        createdById: user.id,
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
  } catch (e) {
    console.error("trainings POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
