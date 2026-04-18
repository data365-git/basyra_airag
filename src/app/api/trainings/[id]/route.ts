import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { generateSessionDates } from "@/lib/utils";
import { handlePrismaError } from "@/lib/prismaError";
import { getTodayInTashkent } from "@/lib/sessionWindow";

const PatchTrainingSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  status: z.enum(["upcoming", "active", "completed"]).optional(),
  attendance_threshold: z.number().int().min(0).max(100).optional(),
  late_threshold_minutes: z.number().int().min(0).max(120).nullable().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  schedule_days: z.array(z.number().int().min(0).max(6))
    .min(1, "At least one day is required")
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b))
    .optional(),
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

    let training = await prisma.training.findUnique({
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

    const expectedDates = generateSessionDates(
      training.startDate.toISOString().slice(0, 10),
      training.endDate.toISOString().slice(0, 10),
      training.scheduleDays
    );
    const existingByDate = new Map(training.sessions.map((session) => [session.sessionDate, session]));
    const missingDates = expectedDates.filter((date) => !existingByDate.has(date));

    if (missingDates.length > 0) {
      const todayStr = getTodayInTashkent();

      // Assign unique temp sessionNumbers (past the existing max) to avoid
      // colliding with the unique (training_id, session_number) index. The
      // resequence pass below renumbers everything to 1..N by date.
      const existingMax = training.sessions.reduce(
        (max, s) => (s.sessionNumber > max ? s.sessionNumber : max),
        0,
      );

      await prisma.session.createMany({
        data: missingDates.map((dateStr, i) => ({
          trainingId: training!.id,
          sessionNumber: existingMax + i + 1, // temp, resequenced below
          sessionDate: dateStr,
          sessionTime: training!.scheduleTime,
          status: dateStr < todayStr ? "closed" : "upcoming",
        })),
      });

      const resequenced = await prisma.session.findMany({
        where: { trainingId: id },
        orderBy: [{ sessionDate: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });

      await prisma.$transaction(
        resequenced.map((session, index) =>
          prisma.session.update({
            where: { id: session.id },
            data: { sessionNumber: index + 1 },
          })
        )
      );

      training = await prisma.training.findUnique({
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
    }

    return NextResponse.json({
      id: training.id,
      name: training.name,
      description: training.description,
      color: training.color,
      icon: training.icon,
      start_date: training.startDate.toISOString().slice(0, 10),
      end_date: training.endDate.toISOString().slice(0, 10),
      schedule_days: training.scheduleDays,
      schedule_time: training.scheduleTime,
      status: training.status,
      attendance_threshold: training.attendanceThreshold,
      late_threshold_minutes: training.lateThresholdMinutes,
      created_by: training.createdById,
      created_at: training.createdAt,
      sessions: training.sessions.map((s) => ({
        id: s.id,
        session_number: s.sessionNumber,
        session_date: s.sessionDate,
        session_time: s.sessionTime,
        status: s.status,
        is_cancelled: s.isCancelled,
        force_closed: s.forceClosed,
      })),
      scan_window_before: training.scanWindowBefore,
      scan_window_after:  training.scanWindowAfter,
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
    if ("late_threshold_minutes" in d) data.lateThresholdMinutes = d.late_threshold_minutes ?? null;
    if (d.start_date !== undefined) data.startDate = new Date(d.start_date);
    if (d.end_date !== undefined) data.endDate = new Date(d.end_date);
    if (d.schedule_days !== undefined) data.scheduleDays = d.schedule_days;
    if (d.schedule_time !== undefined) data.scheduleTime = d.schedule_time;

    const training = await prisma.training.update({ where: { id }, data });

    // If schedule-related fields changed, regenerate non-closed sessions
    const scheduleChanged = d.schedule_days !== undefined || d.start_date !== undefined ||
                            d.end_date !== undefined || d.schedule_time !== undefined;
    if (scheduleChanged) {
      // Use the final values (merged from update + existing training)
      const finalStartDate = d.start_date ?? training.startDate.toISOString().slice(0, 10);
      const finalEndDate = d.end_date ?? training.endDate.toISOString().slice(0, 10);
      const finalDays = d.schedule_days ?? training.scheduleDays;
      const finalTime = d.schedule_time ?? training.scheduleTime;

      // Delete upcoming/open sessions (closed sessions have attendance data — keep them)
      await prisma.session.deleteMany({
        where: { trainingId: id, status: { in: ["upcoming", "open"] } },
      });

      // Count existing closed sessions to continue numbering from
      const closedCount = await prisma.session.count({
        where: { trainingId: id, status: "closed" },
      });

      // Generate new sessions from schedule (returns YYYY-MM-DD strings)
      const newDates = generateSessionDates(finalStartDate, finalEndDate, finalDays);
      const todayStr = new Date().toISOString().slice(0, 10);

      // Filter out dates already covered by closed sessions (by date match)
      const closedSessions = await prisma.session.findMany({
        where: { trainingId: id, status: "closed" },
        select: { sessionDate: true },
      });
      const closedDateStrs = new Set(closedSessions.map((s) => s.sessionDate));

      const newSessionDates = newDates.filter((d) => !closedDateStrs.has(d));

      if (newSessionDates.length > 0) {
        await prisma.session.createMany({
          data: newSessionDates.map((dateStr, i) => ({
            trainingId: id,
            sessionNumber: closedCount + i + 1,
            sessionDate: dateStr,
            sessionTime: finalTime,
            status: dateStr < todayStr ? "closed" : "upcoming",
          })),
        });
      }
    }

    return NextResponse.json({
      id: training.id,
      name: training.name,
      description: training.description,
      color: training.color,
      icon: training.icon,
      start_date: training.startDate.toISOString().slice(0, 10),
      end_date: training.endDate.toISOString().slice(0, 10),
      schedule_days: training.scheduleDays,
      schedule_time: training.scheduleTime,
      status: training.status,
      attendance_threshold: training.attendanceThreshold,
      late_threshold_minutes: training.lateThresholdMinutes,
      created_by: training.createdById,
      created_at: training.createdAt,
    });
  } catch (e) {
    console.error("training PATCH error:", e);
    return handlePrismaError(e) ?? NextResponse.json({ error: "Internal error" }, { status: 500 });
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
    return handlePrismaError(e) ?? NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
