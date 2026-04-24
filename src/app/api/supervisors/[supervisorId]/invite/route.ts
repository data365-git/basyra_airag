import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import type { PermPage, PermAction } from "@/types";

export const dynamic = "force-dynamic";

const SUPERVISORS_PAGE = "supervisors" as PermPage;
const MANAGE = "manage" as PermAction;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ supervisorId: string }> }
) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, SUPERVISORS_PAGE, MANAGE))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { supervisorId } = await params;

    const supervisor = await prisma.supervisor.findUnique({ where: { id: supervisorId } });
    if (!supervisor)
      return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });

    const token = randomUUID();
    await prisma.supervisorInvite.create({
      data: {
        supervisorId,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const inviteUrl = `${base}/supervisor/accept-invite?token=${token}`;

    return NextResponse.json({ invite_url: inviteUrl }, { status: 201 });
  } catch (e) {
    console.error("supervisor invite POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
