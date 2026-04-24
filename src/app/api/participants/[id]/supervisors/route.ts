import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const assignments = await prisma.supervisorAssignment.findMany({
      where: { participantId: id },
      include: {
        supervisor: { select: { id: true, name: true, email: true, isActive: true } },
        training: { select: { id: true, name: true, color: true } },
      },
    });

    return NextResponse.json(
      assignments.map((a) => ({
        supervisor_id: a.supervisor.id,
        supervisor_name: a.supervisor.name,
        supervisor_email: a.supervisor.email,
        is_active: a.supervisor.isActive,
        training_id: a.training?.id ?? null,
        training_name: a.training?.name ?? null,
        training_color: a.training?.color ?? null,
      }))
    );
  } catch (e) {
    console.error("participant supervisors GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { supervisorId, trainingId } = body as {
      supervisorId?: string;
      trainingId?: string | null;
    };

    if (!supervisorId || typeof supervisorId !== "string")
      return NextResponse.json({ error: "supervisorId is required" }, { status: 400 });

    await prisma.supervisorAssignment.deleteMany({
      where: {
        supervisorId,
        participantId: id,
        trainingId: trainingId ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("participant supervisors DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
