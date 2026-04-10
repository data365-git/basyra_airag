import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyJWT(token);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.staffUser.findUnique({
    where: { id: payload.sub },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role_id: user.roleId,
    role: user.role
      ? {
          id: user.role.id,
          name: user.role.name,
          permissions: user.role.permissions,
          created_at: user.role.createdAt,
        }
      : null,
    is_active: user.isActive,
    created_at: user.createdAt,
  });
}
