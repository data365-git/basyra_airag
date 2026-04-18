/**
 * POST /api/portal/materials/[mid]/send
 *
 * Sends a homework material file to the authenticated portal user's
 * Telegram chat via the Grammy bot.
 *
 * Auth:    portal JWT cookie (participant only)
 * Returns: 200 { ok: true } on success
 *          4xx/5xx { error: string } on failure
 */
import { NextRequest, NextResponse } from "next/server";
import fs   from "fs";
import path from "path";
import { InputFile } from "grammy";
import prisma              from "@/lib/prisma";
import { getPortalUser }   from "@/lib/portalAuth";
import { getBot }          from "@/lib/bot";
import { uploadDir }       from "@/lib/localUpload";

export const dynamic    = "force-dynamic";
export const runtime    = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req:    NextRequest,
  { params }: { params: Promise<{ mid: string }> },
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const portal = await getPortalUser(_req);
  if (!portal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { mid } = await params;

  // ── Load material ─────────────────────────────────────────────────────────
  const material = await prisma.homeworkMaterial.findUnique({ where: { id: mid } });
  if (!material) return NextResponse.json({ error: "Material not found" }, { status: 404 });

  if (material.kind === "LINK") {
    return NextResponse.json({ error: "Links cannot be sent via bot — open them directly" }, { status: 400 });
  }

  if (!material.storageUrl) {
    return NextResponse.json({ error: "No file attached to this material" }, { status: 400 });
  }

  // ── Verify file exists on disk ────────────────────────────────────────────
  const key      = material.storageUrl.slice("/api/files/".length);
  const baseDir  = path.resolve(uploadDir());
  const filePath = path.resolve(path.join(baseDir, key));

  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await fs.promises.stat(filePath);
  } catch {
    return NextResponse.json({ error: "File not found on storage" }, { status: 404 });
  }

  // ── Find participant's Telegram chat ID ───────────────────────────────────
  const link = await prisma.telegramLink.findUnique({
    where: { participantId: portal.sub },
  });

  if (!link) {
    return NextResponse.json(
      { error: "Telegram akkauntingiz ulanmagan. Botda /login yuboring." },
      { status: 400 },
    );
  }

  const chatId = Number(link.chatId);

  // ── Send via Grammy bot ───────────────────────────────────────────────────
  try {
    const bot      = getBot();
    const fileName = material.fileName ?? path.basename(filePath);
    const caption  = `📚 <b>${material.title}</b>` +
                     (material.description ? `\n${material.description}` : "");

    const stream    = fs.createReadStream(filePath);
    const inputFile = new InputFile(stream, fileName);

    const kind = material.kind;
    if (kind === "VIDEO") {
      await bot.api.sendVideo(chatId, inputFile, { caption, parse_mode: "HTML" });
    } else if (kind === "AUDIO") {
      await bot.api.sendAudio(chatId, inputFile, { caption, parse_mode: "HTML" });
    } else if (kind === "IMAGE") {
      // sendPhoto doesn't accept a caption with parse_mode at type level — cast
      await bot.api.sendPhoto(chatId, inputFile, { caption, parse_mode: "HTML" });
    } else {
      // PDF, DOCUMENT, and anything else → sendDocument
      await bot.api.sendDocument(chatId, inputFile, { caption, parse_mode: "HTML" });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[portal/materials/send] bot send failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Yuborish amalga oshmadi: ${msg}` }, { status: 502 });
  }
}
