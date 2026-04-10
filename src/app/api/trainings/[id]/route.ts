import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const PatchTrainingSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  status: z.enum(["upcoming", "active", "completed"]).optional(),
  attendance_threshold: z.number().int().min(0).max(100).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  schedule_day: z.number().int().min(0).max(6).optional(),
  schedule_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
}).refine(
  (d) => {
    if (d.start_date && d.end_date) return new Date(d.end_date) >= new Date(d.start_date);
    return true;
  },
  { message: "End date must be on or after start date", path: ["end_date"] }
);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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
  } catch (e) {
    console.error("training GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = PatchTrainingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const data: Record<string, unknown> = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.description !== undefined) data.description = d.description;
    if (d.color !== undefined) data.color = d.color;
    if (d.icon !== undefined) data.icon = d.icon;
    if (d.status !== undefined) data.status = d.status;
    if (d.attendance_threshold !== undefined) data.attendanceThreshold = d.attendance_threshold;
    if (d.start_date !== undefined) data.startDate = new Date(d.start_date);
    if (d.end_date !== undefined) data.endDate = new Date(d.end_date);
    if (d.schedule_day !== undefined) data.scheduleDay = d.schedule_day;
    if (d.schedule_time !== undefined) data.scheduleTime = d.schedule_time;

    const training = await prisma.training.update({ where: { id }, data });
    return NextResponse.json(training);
  } catch (e) {
    console.error("training PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "delete"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await prisma.training.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("training DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
