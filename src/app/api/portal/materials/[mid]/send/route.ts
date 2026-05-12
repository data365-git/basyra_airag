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

const LOCAL_FILES_PREFIX = "/api/files/";

function storageUrlType(storageUrl: string): "local-api-files" | "remote-url" | "unsupported" {
  if (storageUrl.startsWith(LOCAL_FILES_PREFIX)) return "local-api-files";
  if (storageUrl.startsWith("https://") || storageUrl.startsWith("http://")) return "remote-url";
  return "unsupported";
}

async function resolveLocalFile(storageUrl: string): Promise<{ filePath: string; fileName: string } | null> {
  const key = decodeURIComponent(storageUrl.slice(LOCAL_FILES_PREFIX.length));
  if (!key) return null;

  const baseDir  = path.resolve(uploadDir());
  const filePath = path.resolve(path.join(baseDir, key));

  if (!filePath.startsWith(baseDir + path.sep)) return null;

  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return null;

  return { filePath, fileName: path.basename(filePath) };
}

export async function POST(
  req:     NextRequest,
  { params }: { params: Promise<{ mid: string }> },
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const portal = await getPortalUser(req);
  if (!portal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { mid } = await params;

  // ── Load material ─────────────────────────────────────────────────────────
  const material = await prisma.homeworkMaterial.findUnique({
    where: { id: mid },
    include: {
      homework: {
        select: {
          id:         true,
          trainingId: true,
        },
      },
    },
  });
  if (!material) return NextResponse.json({ error: "Material not found" }, { status: 404 });

  const logCtx = {
    materialId:    material.id,
    homeworkId:    material.homeworkId,
    participantId: portal.sub,
    storageUrlType: material.storageUrl ? storageUrlType(material.storageUrl) : "missing",
  };
  console.info("[portal/materials/send] requested", logCtx);

  const enrollment = await prisma.trainingParticipant.findUnique({
    where: {
      trainingId_participantId: {
        trainingId:    material.homework.trainingId,
        participantId: portal.sub,
      },
    },
  });
  if (!enrollment) {
    console.warn("[portal/materials/send] forbidden unenrolled participant", logCtx);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (material.kind === "LINK") {
    return NextResponse.json({ error: "Links cannot be sent via bot — open them directly" }, { status: 400 });
  }

  if (!material.storageUrl) {
    return NextResponse.json({ error: "No file attached to this material" }, { status: 400 });
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
    const caption  = `📚 <b>${material.title}</b>` +
                     (material.description ? `\n${material.description}` : "");
    const urlType  = storageUrlType(material.storageUrl);

    let inputFile: InputFile | string;
    if (urlType === "local-api-files") {
      const resolved = await resolveLocalFile(material.storageUrl);
      if (!resolved) {
        console.warn("[portal/materials/send] local file not found or unsafe", logCtx);
        return NextResponse.json({ error: "File not found on storage" }, { status: 404 });
      }

      const fileName = material.fileName ?? resolved.fileName;
      inputFile = new InputFile(fs.createReadStream(resolved.filePath), fileName);
    } else if (urlType === "remote-url") {
      inputFile = material.storageUrl;
    } else {
      console.warn("[portal/materials/send] unsupported storage URL", logCtx);
      return NextResponse.json({ error: "Unsupported storage URL" }, { status: 400 });
    }

    let result: unknown;
    const kind = material.kind;
    if (kind === "VIDEO") {
      result = await bot.api.sendVideo(chatId, inputFile, { caption, parse_mode: "HTML" });
    } else if (kind === "AUDIO") {
      result = await bot.api.sendAudio(chatId, inputFile, { caption, parse_mode: "HTML" });
    } else if (kind === "IMAGE") {
      // sendPhoto doesn't accept a caption with parse_mode at type level — cast
      result = await bot.api.sendPhoto(chatId, inputFile, { caption, parse_mode: "HTML" });
    } else {
      // PDF, DOCUMENT, and anything else → sendDocument
      result = await bot.api.sendDocument(chatId, inputFile, { caption, parse_mode: "HTML" });
    }

    console.info("[portal/materials/send] sent ok", {
      ...logCtx,
      chatId,
      telegramMessageId: (result as { message_id?: number }).message_id,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.constructor.name : typeof err;
    const errMsg  = err instanceof Error ? err.message : String(err);
    console.error("[portal/materials/send] bot send failed", {
      ...logCtx,
      errName,
      errMsg,
      chatId,
    });
    const msg = errMsg;
    return NextResponse.json({ error: `Yuborish amalga oshmadi: ${msg}` }, { status: 502 });
  }
}
