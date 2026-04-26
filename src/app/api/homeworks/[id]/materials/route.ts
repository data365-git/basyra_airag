import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getPortalUser } from "@/lib/portalAuth";
import { uploadBufferToLocal } from "@/lib/localUpload";
import { HomeworkMaterialKind } from "@prisma/client";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic    = "force-dynamic";
export const runtime    = "nodejs";   // multipart body > 4 MB fails on edge runtime
export const maxDuration = 60;        // allow slow uploads on Railway

/** Infer HomeworkMaterialKind from MIME type. */
function kindFromMime(mime: string): HomeworkMaterialKind {
  if (mime === "application/pdf")    return "PDF";
  if (mime.startsWith("video/"))     return "VIDEO";
  if (mime.startsWith("audio/"))     return "AUDIO";
  if (mime.startsWith("image/"))     return "IMAGE";
  return "DOCUMENT";
}

function serializeMaterial(m: {
  id: string; kind: HomeworkMaterialKind; title: string; description: string | null;
  storageUrl: string | null; fileName: string | null; fileSizeBytes: number | null;
  mimeType: string | null; url: string | null; sortOrder: number; createdAt: Date;
}) {
  return {
    id:             m.id,
    kind:           m.kind,
    title:          m.title,
    description:    m.description,
    storage_url:    m.storageUrl,
    file_name:      m.fileName,
    file_size_bytes: m.fileSizeBytes,
    mime_type:      m.mimeType,
    url:            m.url,
    sort_order:     m.sortOrder,
    created_at:     m.createdAt,
  };
}

// GET — list materials (staff + enrolled portal participant)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: homeworkId } = await params;
  const staff  = await getFullUser();
  const portal = await getPortalUser(req);
  if (!staff && !portal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const homework = await prisma.homework.findUnique({
    where:  { id: homeworkId },
    select: { trainingId: true },
  });
  if (!homework) return NextResponse.json({ error: "Homework not found" }, { status: 404 });

  if (!staff && portal) {
    const enrollment = await prisma.trainingParticipant.findUnique({
      where: {
        trainingId_participantId: {
          trainingId:    homework.trainingId,
          participantId: portal.sub,
        },
      },
    });
    if (!enrollment) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const materials = await prisma.homeworkMaterial.findMany({
    where:   { homeworkId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(materials.map(serializeMaterial));
}

// POST — create material (staff only, multipart for files OR JSON for links)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: homeworkId } = await params;

  const contentType = req.headers.get("content-type") ?? "";

  // ── Link kind: JSON body ──────────────────────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    const { title, description, url } = body;

    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    if (!url?.startsWith("https://"))
      return NextResponse.json({ error: "url must start with https://" }, { status: 400 });

    const mat = await prisma.homeworkMaterial.create({
      data: { homeworkId, kind: "LINK", title: title.trim(), description: description?.trim() || null, url, createdById: user.id },
    });
    return NextResponse.json(serializeMaterial(mat), { status: 201 });
  }

  // ── File kind: multipart/form-data ────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData  = await req.formData();
    const file      = formData.get("file") as File | null;
    const titleRaw  = formData.get("title") as string | null;
    const desc      = formData.get("description") as string | null;
    const sortStr   = formData.get("sort_order") as string | null;

    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024)
      return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });

    const title      = titleRaw?.trim() || file.name;
    const mime       = file.type || "application/octet-stream";
    const kind       = kindFromMime(mime);
    const ext        = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().slice(0, 8) : "bin";
    const key        = `materials/${homeworkId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer     = await file.arrayBuffer();

    // Save DB record immediately — decoupled from upload so the record always
    // exists even if the file write fails. storageUrl is backfilled async.
    const mat = await prisma.homeworkMaterial.create({
      data: {
        homeworkId,
        kind,
        title,
        description:   desc?.trim() || null,
        storageUrl:    null,          // filled once upload succeeds
        fileName:      file.name,
        fileSizeBytes: file.size,
        mimeType:      mime,
        sortOrder:     sortStr ? Number(sortStr) : 0,
        createdById:   user.id,
      },
    });

    // Upload in the background — non-blocking
    void uploadBufferToLocal(buffer, key, mime)
      .then(async (url) => {
        if (url) {
          await prisma.homeworkMaterial.update({
            where: { id: mat.id },
            data:  { storageUrl: url },
          });
        } else {
          console.error("[materials] upload returned null for key:", key);
        }
      })
      .catch((err) => console.error("[materials] background upload failed:", err));

    return NextResponse.json(serializeMaterial(mat), { status: 201 });
  }

  return NextResponse.json({ error: "Expected multipart/form-data or application/json" }, { status: 400 });
}
