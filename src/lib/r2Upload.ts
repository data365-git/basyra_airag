/**
 * Upload a Telegram-hosted file to Cloudflare R2 and persist the storage URL
 * on the corresponding HomeworkFile row.
 *
 * Call this in a fire-and-forget manner after writing the HomeworkFile row —
 * failures are logged but never surface to the user.
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import prisma from "@/lib/prisma";
import { getR2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export async function uploadTelegramFileToR2(homeworkFileId: string): Promise<void> {
  try {
    const hf = await prisma.homeworkFile.findUnique({ where: { id: homeworkFileId } });
    if (!hf) return;
    if (hf.storageUrl) return;                 // already uploaded
    if (!hf.telegramFileId) return;            // nothing to fetch

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    // R2 env sanity — bail silently if not configured
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID ||
        !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME ||
        !process.env.R2_PUBLIC_URL) return;

    // 1. Resolve Telegram file path
    const metaRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(hf.telegramFileId)}`,
      { cache: "no-store" }
    );
    const meta = await metaRes.json().catch(() => null) as
      { ok?: boolean; result?: { file_path?: string } } | null;
    if (!meta?.ok || !meta.result?.file_path) return;

    // 2. Download bytes
    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${meta.result.file_path}`,
      { cache: "no-store" }
    );
    if (!fileRes.ok) return;
    const arrayBuf = await fileRes.arrayBuffer();
    const contentType = fileRes.headers.get("content-type") ?? "application/octet-stream";

    // 3. Build R2 key — "homework/<submissionId>/<hfId>.<ext>"
    const ext = hf.fileName.includes(".")
      ? hf.fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)
      : "bin";
    const key = `homework/${hf.submissionId}/${hf.id}.${ext || "bin"}`;

    // 4. Upload to R2
    const client = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket:      R2_BUCKET(),
      Key:         key,
      Body:        new Uint8Array(arrayBuf),
      ContentType: contentType,
    }));

    // 5. Persist storage URL
    const publicUrl = `${R2_PUBLIC_URL()}/${key}`;
    await prisma.homeworkFile.update({
      where: { id: hf.id },
      data:  { storageUrl: publicUrl },
    });
  } catch (err) {
    console.error("[r2Upload] Telegram → R2 failed:", err);
  }
}

/**
 * Upload a raw buffer directly to R2 under the given key.
 * Returns the public URL or null on failure.
 */
export async function uploadBufferToR2(
  buffer:      ArrayBuffer | Uint8Array,
  key:         string,
  contentType: string,
): Promise<string | null> {
  try {
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID ||
        !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME ||
        !process.env.R2_PUBLIC_URL) return null;

    const client = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket:      R2_BUCKET(),
      Key:         key,
      Body:        buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer),
      ContentType: contentType,
    }));
    return `${R2_PUBLIC_URL()}/${key}`;
  } catch (err) {
    console.error("[r2Upload] uploadBufferToR2 failed:", err);
    return null;
  }
}

/**
 * Delete an R2 object by its public URL. Used when cleaning up orphaned files
 * after a submission is deleted.
 */
export async function deleteR2ObjectByPublicUrl(publicUrl: string): Promise<void> {
  try {
    const prefix = R2_PUBLIC_URL();
    if (!prefix || !publicUrl.startsWith(prefix)) return;
    const key = publicUrl.slice(prefix.length).replace(/^\/+/, "");
    if (!key) return;

    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET(),
      Key:    key,
    }));
  } catch (err) {
    console.error("[r2Upload] delete failed:", err);
  }
}
