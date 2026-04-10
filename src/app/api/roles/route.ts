import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { staffUsers: true } } },
  });

  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color,
      is_superadmin: r.isSuperadmin,
      permissions: r.permissions,
      created_at: r.createdAt,
      user_count: r._count.staffUsers,
    }))
  );
}

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "settings.roles", "create"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { name, description, color, is_superadmin, permissions } = body;

  const role = await prisma.role.create({
    data: { name, description, color: color ?? "#6366f1", isSuperadmin: is_superadmin ?? false, permissions },
  });

  return NextResponse.json({
    id: role.id, name: role.name, description: role.description,
    color: role.color, is_superadmin: role.isSuperadmin,
    permissions: role.permissions, created_at: role.createdAt, user_count: 0,
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "settings.roles", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { id, name, description, color, is_superadmin, permissions } = body;

  const role = await prisma.role.update({
    where: { id },
    data: {
      ...(name        !== undefined ? { name }                          : {}),
      ...(description !== undefined ? { description }                   : {}),
      ...(color       !== undefined ? { color }                         : {}),
      ...(is_superadmin !== undefined ? { isSuperadmin: is_superadmin } : {}),
      ...(permissions !== undefined ? { permissions }                   : {}),
    },
    include: { _count: { select: { staffUsers: true } } },
  });

  return NextResponse.json({
    id: role.id, name: role.name, description: role.description,
    color: role.color, is_superadmin: role.isSuperadmin,
    permissions: role.permissions, created_at: role.createdAt,
    user_count: role._count.staffUsers,
  });
}

export async function DELETE(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "settings.roles", "delete"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const userCount = await prisma.staffUser.count({ where: { roleId: id } });
  if (userCount > 0)
    return NextResponse.json({ error: "Cannot delete a role with active users" }, { status: 409 });

  await prisma.role.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
