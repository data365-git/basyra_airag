/**
 * POST /api/upload
 *
 * Returns a pre-signed PUT URL for uploading directly from the browser
 * to Cloudflare R2. Caller uploads the file, then stores the returned
 * `publicUrl` in the homework submission.
 *
 * Body (JSON):
 *   { filename: string, contentType: string, folder?: string }
 *
 * Response:
 *   { uploadUrl: string, publicUrl: string, key: string }
 *
 * Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 *                    R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import { NextResponse, type NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";
import { cookies } from "next/headers";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const MAX_MB = 20;

export async function POST(req: NextRequest) {
  // Auth: staff OR portal participant
  const jar     = await cookies();
  const token   = jar.get(COOKIE_NAME)?.value;
  const staff   = token ? await verifyJWT(token) : null;
  const portal  = await getPortalUser();
  if (!staff && !portal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { filename, contentType, folder = "uploads" } = body;

  if (!filename || !contentType) {
    return NextResponse.json({ error: "filename and contentType required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  // Build a unique storage key
  const ext = (filename as string).split(".").pop() ?? "bin";
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  let uploadUrl: string;
  try {
    const client  = getR2Client();
    const bucket  = R2_BUCKET();
    const command = new PutObjectCommand({
      Bucket:      bucket,
      Key:         key,
      ContentType: contentType,
    });
    uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 }); // 5 min
  } catch (err: any) {
    console.error("[R2 upload]", err?.message);
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const publicUrl = `${R2_PUBLIC_URL()}/${key}`;
  return NextResponse.json({ uploadUrl, publicUrl, key });
}
