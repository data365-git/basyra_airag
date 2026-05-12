/**
 * GET /api/homework-files/[id]/download
 *
 * Serves a HomeworkFile to the browser with a stable URL that never expires.
 *
 * Resolution order:
 *   1. If `storageUrl` is set (R2 has the file) → 302 redirect to the public URL.
 *   2. Else if `telegramFileId` is set → call Telegram getFile, stream bytes back.
 *      (Telegram file URLs expire in 1 hour, so we proxy each request.)
 *   3. Else → 404.
 *
 * Auth: staff (any) OR the owning portal participant.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth
  const jar     = await cookies();
  const token   = jar.get(COOKIE_NAME)?.value;
  const staff   = token ? await verifyJWT(token) : null;
  const portal  = await getPortalUser();
  if (!staff && !portal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = await prisma.homeworkFile.findUnique({
    where:   { id },
    include: {
      submission: { select: { participantId: true } },
    },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Portal users can only download their own submission files
  if (!staff && portal && file.submission.participantId !== portal.sub) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prefer R2 — permanent URL
  if (file.storageUrl) {
    return NextResponse.redirect(file.storageUrl, 302);
  }

  // Fall back to Telegram proxy
  if (file.telegramFileId) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
    }

    try {
      // 1. Resolve file_path from Telegram
      const metaRes = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(file.telegramFileId)}`,
        { cache: "no-store" }
      );
      const meta = await metaRes.json().catch(() => null) as { ok?: boolean; result?: { file_path?: string } } | null;
      if (!meta?.ok || !meta.result?.file_path) {
        return NextResponse.json({ error: "Telegram file unavailable" }, { status: 502 });
      }

      // 2. Stream the file bytes back to the client
      const fileRes = await fetch(
        `https://api.telegram.org/file/bot${botToken}/${meta.result.file_path}`,
        { cache: "no-store" }
      );
      if (!fileRes.ok || !fileRes.body) {
        return NextResponse.json({ error: "Telegram download failed" }, { status: 502 });
      }

      const headers = new Headers();
      const ct = fileRes.headers.get("content-type") ?? "application/octet-stream";
      headers.set("Content-Type", ct);
      const cl = fileRes.headers.get("content-length");
      if (cl) headers.set("Content-Length", cl);
      // Safe filename — strip quotes/newlines
      const safeName = file.fileName.replace(/["\r\n]/g, "_");
      headers.set("Content-Disposition", `inline; filename="${safeName}"`);
      headers.set("Cache-Control", "private, max-age=300"); // 5 min browser cache

      return new NextResponse(fileRes.body, { status: 200, headers });
    } catch (err) {
      console.error("[homework-files download]", err);
      return NextResponse.json({ error: "Proxy error" }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "No file source" }, { status: 404 });
}
