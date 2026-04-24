import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { SUPERVISOR_COOKIE, signSupervisorJWT } from "@/lib/supervisorAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  const supervisor = await prisma.supervisor.findFirst({
    where: { email, isActive: true },
  });

  if (!supervisor || !(await bcrypt.compare(password, supervisor.passwordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const jwt = await signSupervisorJWT({ sub: supervisor.id, email: supervisor.email });

  const cookieStore = await cookies();
  cookieStore.set(SUPERVISOR_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });

  await prisma.supervisor.update({
    where: { id: supervisor.id },
    data: { lastLoginAt: new Date() },
  });

  return NextResponse.json({ ok: true, name: supervisor.name, email: supervisor.email });
}
