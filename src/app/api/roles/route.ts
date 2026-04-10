import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const RoleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().nullable(),
  color: z.string().optional(),
  is_superadmin: z.boolean().optional(),
  permissions: z.record(z.unknown()).optional(),
});

const PatchRoleSchema = RoleSchema.partial().extend({
  id: z.string().min(1, "id is required"),
});

export async function GET() {
  try {
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
  } catch (e) {
    console.error("roles GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "settings.roles", "create"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = RoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, description, color, is_superadmin, permissions } = parsed.data;

    const role = await prisma.role.create({
      data: { name, description, color: color ?? "#6366f1", isSuperadmin: is_superadmin ?? false, permissions },
    });

    return NextResponse.json({
      id: role.id, name: role.name, description: role.description,
      color: role.color, is_superadmin: role.isSuperadmin,
      permissions: role.permissions, created_at: role.createdAt, user_count: 0,
    }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    console.error("roles POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "settings.roles", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = PatchRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id, name, description, color, is_superadmin, permissions } = parsed.data;

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
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    console.error("roles PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE is handled by /api/roles/[id]/route.ts
