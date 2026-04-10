import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const users = await prisma.staffUser.findMany({
    orderBy: { name: "asc" },
    include: { role: true },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role_id: u.roleId,
      role: u.role,
      is_active: u.isActive,
      created_at: u.createdAt,
    }))
  );
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, role_id, is_active, name } = body;

  const user = await prisma.staffUser.update({
    where: { id },
    data: {
      ...(role_id !== undefined ? { roleId: role_id } : {}),
      ...(is_active !== undefined ? { isActive: is_active } : {}),
      ...(name !== undefined ? { name } : {}),
    },
    include: { role: true },
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role_id: user.roleId,
    role: user.role,
    is_active: user.isActive,
    created_at: user.createdAt,
  });
}
