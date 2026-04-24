import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import type { PermPage, PermAction } from "@/types";

export const dynamic = "force-dynamic";

const SUPERVISORS_PAGE = "supervisors" as PermPage;
const MANAGE = "manage" as PermAction;

function mapAssignment(a: {
  id: string;
  supervisorId: string;
  participantId: string;
  trainingId: string | null;
  createdAt: Date;
}) {
  return {
    id: a.id,
    supervisor_id: a.supervisorId,
    participant_id: a.participantId,
    training_id: a.trainingId,
    created_at: a.createdAt.toISOString(),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ supervisorId: string }> }
) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, SUPERVISORS_PAGE, "view"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { supervisorId } = await params;

    const assignments = await prisma.supervisorAssignment.findMany({
      where: { supervisorId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(assignments.map(mapAssignment));
  } catch (e) {
    console.error("supervisor assignments GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ supervisorId: string }> }
) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, SUPERVISORS_PAGE, MANAGE))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { supervisorId } = await params;
    const body = await request.json();
    const { participantId, trainingId } = body as {
      participantId?: string;
      trainingId?: string | null;
    };

    if (!participantId || typeof participantId !== "string")
      return NextResponse.json({ error: "participantId is required" }, { status: 400 });

    try {
      const assignment = await prisma.supervisorAssignment.create({
        data: {
          supervisorId,
          participantId,
          trainingId: trainingId ?? null,
        },
      });
      return NextResponse.json(mapAssignment(assignment), { status: 201 });
    } catch (inner: unknown) {
      const err = inner as { code?: string };
      // Unique constraint violation — assignment already exists, return existing
      if (err?.code === "P2002") {
        const existing = await prisma.supervisorAssignment.findFirst({
          where: { supervisorId, participantId, trainingId: trainingId ?? null },
        });
        if (existing) return NextResponse.json(mapAssignment(existing));
      }
      throw inner;
    }
  } catch (e) {
    console.error("supervisor assignments POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ supervisorId: string }> }
) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, SUPERVISORS_PAGE, MANAGE))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { supervisorId } = await params;
    const body = await request.json();
    const { participantId, trainingId } = body as {
      participantId?: string;
      trainingId?: string | null;
    };

    if (!participantId || typeof participantId !== "string")
      return NextResponse.json({ error: "participantId is required" }, { status: 400 });

    await prisma.supervisorAssignment.deleteMany({
      where: {
        supervisorId,
        participantId,
        trainingId: trainingId ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("supervisor assignments DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
