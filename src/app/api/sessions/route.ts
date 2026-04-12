import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const CreateSessionSchema = z.object({
  training_id: z.string().min(1, "training_id is required"),
  session_date: z.string().min(1, "session_date is required"),
  session_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time (HH:MM)"),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const trainingId = searchParams.get("training_id");
    const statusParam = searchParams.get("status");
    const statuses = statusParam ? statusParam.split(",") : undefined;

    const sessions = await prisma.session.findMany({
      where: {
        ...(trainingId ? { trainingId } : {}),
        ...(statuses ? { status: { in: statuses } } : {}),
      },
      orderBy: [{ trainingId: "asc" }, { sessionNumber: "asc" }],
    });

    return NextResponse.json(
      sessions.map((s) => ({
        id: s.id,
        training_id: s.trainingId,
        session_number: s.sessionNumber,
        session_date: s.sessionDate,
        session_time: s.sessionTime,
        status: s.status,
        created_at: s.createdAt,
      }))
    );
  } catch (e) {
    console.error("sessions GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { training_id, session_date, session_time } = parsed.data;

    // Verify training exists
    const training = await prisma.training.findUnique({ where: { id: training_id } });
    if (!training) return NextResponse.json({ error: "Training not found" }, { status: 404 });

    // Auto-calculate next session number
    const last = await prisma.session.findFirst({
      where: { trainingId: training_id },
      orderBy: { sessionNumber: "desc" },
      select: { sessionNumber: true },
    });
    const nextNumber = (last?.sessionNumber ?? 0) + 1;

    const todayStr = new Date().toISOString().slice(0, 10);
    const status = session_date < todayStr ? "closed" : "upcoming";

    const session = await prisma.session.create({
      data: {
        trainingId: training_id,
        sessionNumber: nextNumber,
        sessionDate: session_date,
        sessionTime: session_time,
        status,
      },
    });

    return NextResponse.json({
      id: session.id,
      training_id: session.trainingId,
      session_number: session.sessionNumber,
      session_date: session.sessionDate,
      session_time: session.sessionTime,
      status: session.status,
      created_at: session.createdAt,
    }, { status: 201 });
  } catch (e) {
    console.error("sessions POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
