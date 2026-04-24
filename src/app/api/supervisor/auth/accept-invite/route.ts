import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { SUPERVISOR_COOKIE, signSupervisorJWT } from "@/lib/supervisorAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { token, name, password } = await req.json();

  const invite = await prisma.supervisorInvite.findFirst({
    where: {
      token,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  const supervisor = await prisma.supervisor.findUnique({
    where: { id: invite.supervisorId },
  });

  if (!supervisor) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.supervisor.update({
    where: { id: supervisor.id },
    data: { name, passwordHash, isActive: true },
  });

  await prisma.supervisorInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  const jwt = await signSupervisorJWT({ sub: supervisor.id, email: supervisor.email });

  const cookieStore = await cookies();
  cookieStore.set(SUPERVISOR_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true });
}
