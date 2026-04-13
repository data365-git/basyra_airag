import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { comparePassword } from "@/lib/auth";
import { signPortalJWT, PORTAL_COOKIE } from "@/lib/portalAuth";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password)
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });

    const auth = await prisma.participantAuth.findUnique({
      where: { username: username.trim().toLowerCase() },
      include: { participant: { select: { id: true, fullName: true } } },
    });

    if (!auth) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const valid = await comparePassword(password, auth.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    // Update last login
    await prisma.participantAuth.update({
      where: { id: auth.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signPortalJWT({
      sub:      auth.participantId,
      username: auth.username,
    });

    const response = NextResponse.json({
      participantId: auth.participantId,
      name:          auth.participant.fullName,
      username:      auth.username,
    });

    response.cookies.set(PORTAL_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 30, // 30 days
      path:     "/",
    });

    return response;
  } catch (e) {
    console.error("portal login error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
