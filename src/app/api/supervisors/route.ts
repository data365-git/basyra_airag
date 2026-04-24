import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import type { PermPage } from "@/types";

export const dynamic = "force-dynamic";

const SUPERVISORS_PAGE = "supervisors" as PermPage;

async function generateInviteUrl(supervisorId: string): Promise<string> {
  const token = randomUUID();
  await prisma.supervisorInvite.create({
    data: {
      supervisorId,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/supervisor/accept-invite?token=${token}`;
}

function mapSupervisor(s: {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  _count?: { assignments: number };
}) {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    is_active: s.isActive,
    last_login_at: s.lastLoginAt?.toISOString() ?? null,
    created_at: s.createdAt.toISOString(),
    assignment_count: s._count?.assignments ?? 0,
  };
}

export async function GET() {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, SUPERVISORS_PAGE, "view"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supervisors = await prisma.supervisor.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { assignments: true } } },
    });

    return NextResponse.json(supervisors.map(mapSupervisor));
  } catch (e) {
    console.error("supervisors GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, SUPERVISORS_PAGE, "manage" as Parameters<typeof hasPermission>[2]))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { name, email } = body as { name?: string; email?: string };

    if (!name || typeof name !== "string" || name.trim().length === 0)
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!email || typeof email !== "string" || !email.includes("@"))
      return NextResponse.json({ error: "valid email is required" }, { status: 400 });

    const passwordHash = await bcrypt.hash(randomUUID(), 12);

    const supervisor = await prisma.supervisor.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        isActive: true,
      },
    });

    const inviteUrl = await generateInviteUrl(supervisor.id);

    return NextResponse.json(
      { id: supervisor.id, name: supervisor.name, email: supervisor.email, invite_url: inviteUrl },
      { status: 201 }
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2002")
      return NextResponse.json({ error: "A supervisor with this email already exists" }, { status: 409 });
    console.error("supervisors POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
