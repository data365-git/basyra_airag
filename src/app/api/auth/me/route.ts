import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT, COOKIE_NAME, hashPassword, comparePassword } from "@/lib/auth";
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
    avatar_url: user.avatarUrl ?? null,
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

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await verifyJWT(token);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.staffUser.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, avatar_url, current_password, new_password } = body;

  const updateData: Record<string, unknown> = {};

  // Update display name
  if (typeof name === "string" && name.trim().length > 0) {
    updateData.name = name.trim();
  }

  // Update avatar URL (allow clearing with empty string → null)
  if (typeof avatar_url === "string") {
    updateData.avatarUrl = avatar_url.trim() || null;
  }

  // Update password (requires current password verification)
  if (new_password) {
    if (!current_password) {
      return NextResponse.json({ error: "current_password_required" }, { status: 400 });
    }
    const valid = await comparePassword(current_password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "wrong_password" }, { status: 400 });
    }
    if (typeof new_password !== "string" || new_password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    updateData.password = await hashPassword(new_password);
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.staffUser.update({
    where: { id: user.id },
    data: updateData,
    include: { role: true },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    avatar_url: updated.avatarUrl ?? null,
    role_id: updated.roleId,
    role: updated.role
      ? {
          id: updated.role.id,
          name: updated.role.name,
          permissions: updated.role.permissions,
          created_at: updated.role.createdAt,
        }
      : null,
    is_active: updated.isActive,
    created_at: updated.createdAt,
  });
}
