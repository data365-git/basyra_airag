import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";

const CreateSchema = z.object({
  username: z.string().min(3).max(40).regex(/^[a-z0-9._-]+$/, "Only lowercase letters, numbers, dots, dashes"),
  password: z.string().min(6).max(100),
});

const UpdateSchema = z.object({
  password: z.string().min(6).max(100).optional(),
  username: z.string().min(3).max(40).regex(/^[a-z0-9._-]+$/).optional(),
});

// GET — check if login exists
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getFullUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(admin, "participants", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const auth = await prisma.participantAuth.findUnique({
    where: { participantId: id },
    select: { id: true, username: true, lastLoginAt: true, createdAt: true },
  });

  return NextResponse.json(auth ?? null);
}

// POST — create login
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getFullUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(admin, "participants", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const participant = await prisma.participant.findUnique({ where: { id } });
  if (!participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  const existing = await prisma.participantAuth.findUnique({ where: { participantId: id } });
  if (existing) return NextResponse.json({ error: "Login already exists" }, { status: 409 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { username, password } = parsed.data;

  const taken = await prisma.participantAuth.findUnique({ where: { username } });
  if (taken) return NextResponse.json({ error: "Username already taken" }, { status: 409 });

  const passwordHash = await hashPassword(password);
  const auth = await prisma.participantAuth.create({
    data: { participantId: id, username, passwordHash },
    select: { id: true, username: true, createdAt: true },
  });

  return NextResponse.json(auth, { status: 201 });
}

// PATCH — update password or username
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getFullUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(admin, "participants", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { username, password } = parsed.data;
  const updateData: Record<string, string> = {};

  if (username) {
    const taken = await prisma.participantAuth.findFirst({ where: { username, NOT: { participantId: id } } });
    if (taken) return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    updateData.username = username;
  }
  if (password) {
    updateData.passwordHash = await hashPassword(password);
  }

  const auth = await prisma.participantAuth.update({
    where: { participantId: id },
    data: updateData,
    select: { id: true, username: true, lastLoginAt: true },
  });

  return NextResponse.json(auth);
}

// DELETE — remove login
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getFullUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(admin, "participants", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.participantAuth.deleteMany({ where: { participantId: id } });
  return NextResponse.json({ deleted: true });
}
