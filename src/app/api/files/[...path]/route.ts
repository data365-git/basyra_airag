/**
 * GET /api/files/[...path]
 *
 * Auth-gated static file server for Railway Volume uploads.
 * Streams the file from disk with proper Content-Type and size headers.
 * Prevents path-traversal attacks before opening any file.
 */
import { NextRequest, NextResponse } from "next/server";
import fs   from "fs";
import path from "path";
import { cookies } from "next/headers";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";
import { uploadDir } from "@/lib/localUpload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── MIME type lookup ─────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  pdf:  "application/pdf",
  mp4:  "video/mp4",
  mov:  "video/quicktime",
  webm: "video/webm",
  mp3:  "audio/mpeg",
  ogg:  "audio/ogg",
  wav:  "audio/wav",
  m4a:  "audio/mp4",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  gif:  "image/gif",
  webp: "image/webp",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:  "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:  "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip:  "application/zip",
  txt:  "text/plain",
};

function mimeFromExt(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  // Auth — staff or portal participant
  const jar    = await cookies();
  const token  = jar.get(COOKIE_NAME)?.value;
  const staff  = token ? verifyJWT(token) : null;
  const portal = staff ? null : await getPortalUser(_req);

  if (!staff && !portal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segments } = await params;

  // Sanitise each segment (reject ".." etc.)
  if (segments.some((s) => s.includes(".."))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseDir  = path.resolve(uploadDir());
  const filePath = path.resolve(path.join(baseDir, ...segments));

  // Double-check resolved path stays inside the upload dir
  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename    = segments.at(-1) ?? "file";
  const contentType = mimeFromExt(filename);
  const stream      = fs.createReadStream(filePath);

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type":        contentType,
      "Content-Length":      String(stat.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control":       "private, max-age=3600",
    },
  });
}
