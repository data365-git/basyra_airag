import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { deleteR2ObjectByPublicUrl } from "@/lib/r2Upload";
import { cookies } from "next/headers";

async function getStaffUser() {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return token ? verifyJWT(token) : null;
}

// DELETE /api/homeworks/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Gather R2 URLs across all child submissions' files BEFORE cascade delete
  const files = await prisma.homeworkFile.findMany({
    where:  { submission: { homeworkId: id }, storageUrl: { not: null } },
    select: { storageUrl: true },
  });

  await prisma.homework.delete({ where: { id } });

  // Fire-and-forget R2 cleanup
  for (const f of files) {
    if (f.storageUrl) void deleteR2ObjectByPublicUrl(f.storageUrl);
  }

  return new NextResponse(null, { status: 204 });
}

// PATCH /api/homeworks/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updated = await prisma.homework.update({
    where: { id },
    data: {
      ...(body.title       !== undefined && { title:       body.title.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.due_date    !== undefined && { dueDate:     body.due_date || null }),
      ...(body.max_score   !== undefined && { maxScore:    body.max_score }),
    },
  });

  return NextResponse.json(updated);
}
