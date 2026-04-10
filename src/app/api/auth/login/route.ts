import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signJWT, comparePassword, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await prisma.staffUser.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await comparePassword(password, user.password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await signJWT({
    sub: user.id,
    email: user.email,
    roleId: user.roleId,
  });

  const response = NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    role: user.role,
    isActive: user.isActive,
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return response;
}
