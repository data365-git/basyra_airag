import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { deleteLocalFile } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

// PATCH — update title / description / url / sort_order
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { mid } = await params;
  const body = await req.json().catch(() => ({}));
  const { title, description, url, sort_order } = body;

  const mat = await prisma.homeworkMaterial.findUnique({ where: { id: mid } });
  if (!mat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.homeworkMaterial.update({
    where: { id: mid },
    data: {
      ...(title       != null ? { title: String(title).trim() }             : {}),
      ...(description != null ? { description: String(description).trim() || null } : {}),
      ...(url         != null ? { url: String(url) }                        : {}),
      ...(sort_order  != null ? { sortOrder: Number(sort_order) }           : {}),
    },
  });

  return NextResponse.json({
    id: updated.id, kind: updated.kind, title: updated.title,
    description: updated.description, storage_url: updated.storageUrl,
    file_name: updated.fileName, file_size_bytes: updated.fileSizeBytes,
    mime_type: updated.mimeType, url: updated.url, sort_order: updated.sortOrder,
    created_at: updated.createdAt,
  });
}

// DELETE — remove material + R2 object
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "delete"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { mid } = await params;
  const mat = await prisma.homeworkMaterial.findUnique({ where: { id: mid } });
  if (!mat) return new NextResponse(null, { status: 204 });

  await prisma.homeworkMaterial.delete({ where: { id: mid } });
  if (mat.storageUrl) void deleteLocalFile(mat.storageUrl);

  return new NextResponse(null, { status: 204 });
}
