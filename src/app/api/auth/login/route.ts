import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signJWT, comparePassword, COOKIE_NAME } from "@/lib/auth";
import { tryNormalizePhone } from "@/lib/phone";

export async function POST(request: Request) {
  const { usernameOrEmail, password } = await request.json();

  if (!usernameOrEmail || !password) {
    return NextResponse.json({ error: "Username/email/phone and password required" }, { status: 400 });
  }

  const credential = String(usernameOrEmail).trim();
  const normalizedPhone = tryNormalizePhone(credential);

  let user = await prisma.staffUser.findUnique({
    where: { username: credential },
    include: { role: true },
  });

  if (!user) {
    user = await prisma.staffUser.findUnique({
      where: { email: credential },
      include: { role: true },
    });
  }

  if (!user && normalizedPhone) {
    user = await prisma.staffUser.findUnique({
      where: { phone: normalizedPhone },
      include: { role: true },
    });
  }

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await comparePassword(password, user.password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signJWT({
    sub: user.id,
    email: user.email ?? "",
    roleId: user.roleId,
  });

  const response = NextResponse.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
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
