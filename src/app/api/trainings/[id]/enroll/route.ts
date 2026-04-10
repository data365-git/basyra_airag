import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const EnrollSchema = z.object({
  participant_id: z.string().min(1, "participant_id is required"),
});

/** POST /api/trainings/[id]/enroll  — enroll a participant */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: trainingId } = await params;
    const body = await request.json();
    const parsed = EnrollSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { participant_id } = parsed.data;

    // Check training exists
    const training = await prisma.training.findUnique({ where: { id: trainingId } });
    if (!training) return NextResponse.json({ error: "Training not found" }, { status: 404 });

    // Idempotent — if already enrolled, just return success
    const existing = await prisma.trainingParticipant.findUnique({
      where: { trainingId_participantId: { trainingId, participantId: participant_id } },
    });
    if (existing) return NextResponse.json({ success: true, already_enrolled: true });

    await prisma.trainingParticipant.create({
      data: { trainingId, participantId: participant_id },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    console.error("enroll POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** DELETE /api/trainings/[id]/enroll  — unenroll a participant */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: trainingId } = await params;
    const body = await request.json();
    const parsed = EnrollSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { participant_id } = parsed.data;

    await prisma.trainingParticipant.deleteMany({
      where: { trainingId, participantId: participant_id },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("enroll DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
