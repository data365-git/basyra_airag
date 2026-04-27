import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";

const CreateUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  username: z.string().min(3, "Username must be at least 3 characters").max(80),
  email: z.string().email("Invalid email").max(200).optional().nullable(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role_id: z.string().optional().nullable(),
});

const PatchUserSchema = z.object({
  id: z.string().min(1),
  role_id: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
});

function mapUser(u: { id: string; name: string; username: string | null; email: string | null; roleId: string | null; role: { id: string; name: string; description: string | null; color: string; isSuperadmin: boolean; permissions: unknown; createdAt: Date } | null; isActive: boolean; createdAt: Date }) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role_id: u.roleId,
    role: u.role,
    is_active: u.isActive,
    created_at: u.createdAt,
  };
}

export async function GET(request: Request) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, "settings.users", "view"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    void request;
    const users = await prisma.staffUser.findMany({
      orderBy: { name: "asc" },
      include: { role: true },
    });

    return NextResponse.json(users.map(mapUser));
  } catch (e) {
    console.error("users GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, "settings.users", "create"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, username, email, password, role_id } = parsed.data;

    const existingByUsername = await prisma.staffUser.findUnique({ where: { username } });
    if (existingByUsername) {
      return NextResponse.json({ error: "A user with this username already exists" }, { status: 409 });
    }

    if (email) {
      const existingByEmail = await prisma.staffUser.findUnique({ where: { email } });
      if (existingByEmail) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
    }

    const hashed = await hashPassword(password);

    const user = await prisma.staffUser.create({
      data: {
        name,
        username,
        ...(email ? { email } : {}),
        password: hashed,
        roleId: role_id || null,
        isActive: true,
      },
      include: { role: true },
    });

    return NextResponse.json(mapUser(user), { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A user with this username or email already exists" }, { status: 409 });
    }
    console.error("users POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, "settings.users", "delete"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Cannot delete yourself
    if (id === caller.id)
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

    // Protect the last superadmin
    const target = await prisma.staffUser.findUnique({
      where: { id },
      include: { role: { select: { isSuperadmin: true } } },
    });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (target.role?.isSuperadmin) {
      const superadminCount = await prisma.staffUser.count({
        where: { role: { isSuperadmin: true }, isActive: true },
      });
      if (superadminCount <= 1)
        return NextResponse.json({ error: "Cannot delete the last superadmin account" }, { status: 400 });
    }

    await prisma.staffUser.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("users DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const caller = await getFullUser();
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(caller, "settings.users", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = PatchUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id, role_id, is_active, name } = parsed.data;

    const user = await prisma.staffUser.update({
      where: { id },
      data: {
        ...(role_id !== undefined ? { roleId: role_id } : {}),
        ...(is_active !== undefined ? { isActive: is_active } : {}),
        ...(name !== undefined ? { name } : {}),
      },
      include: { role: true },
    });

    return NextResponse.json(mapUser(user));
  } catch (e) {
    console.error("users PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
