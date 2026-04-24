import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import type { PermPage, PermAction } from "@/types";

export const dynamic = "force-dynamic";

const SUPERVISORS_PAGE = "supervisors" as PermPage;
const MANAGE = "manage" as PermAction;

function mapSupervisor(s: {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  assignments: Array<{
    id: string;
    participantId: string;
    trainingId: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    is_active: s.isActive,
    last_login_at: s.lastLoginAt?.toISOString() ?? null,
    created_at: s.createdAt.toISOString(),
    assignments: s.assignments.map((a) => ({
      id: a.id,
      participant_id: a.participantId,
      training_id: a.trainingId,
      created_at: a.createdAt.toISOString(),
    })),
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

    const supervisor = await prisma.supervisor.findUnique({
      where: { id: supervisorId },
      include: { assignments: true },
    });

    if (!supervisor)
      return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });

    return NextResponse.json(mapSupervisor(supervisor));
  } catch (e) {
    console.error("supervisor GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
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
    const { name, email, is_active } = body as {
      name?: string;
      email?: string;
      is_active?: boolean;
    };

    const supervisor = await prisma.supervisor.update({
      where: { id: supervisorId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}),
        ...(is_active !== undefined ? { isActive: is_active } : {}),
      },
      include: { assignments: true },
    });

    return NextResponse.json(mapSupervisor(supervisor));
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2025")
      return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });
    if (err?.code === "P2002")
      return NextResponse.json({ error: "A supervisor with this email already exists" }, { status: 409 });
    console.error("supervisor PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ supervisorId: string }> }
) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, SUPERVISORS_PAGE, MANAGE))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { supervisorId } = await params;

    await prisma.supervisor.delete({ where: { id: supervisorId } });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2025")
      return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });
    console.error("supervisor DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
