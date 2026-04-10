import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions,
      created_at: r.createdAt,
    }))
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, permissions } = body;

  const role = await prisma.role.create({ data: { name, permissions } });
  return NextResponse.json(role, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, name, permissions } = body;

  const role = await prisma.role.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
    },
  });
  return NextResponse.json(role);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.role.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
