/**
 * Cloudflare R2 helper — creates an S3-compatible client pointed at the
 * account's R2 endpoint.
 *
 * Required env vars (set in Railway → Variables):
 *   R2_ACCOUNT_ID        — Cloudflare account ID
 *   R2_ACCESS_KEY_ID     — R2 API token Access Key ID
 *   R2_SECRET_ACCESS_KEY — R2 API token Secret Access Key
 *   R2_BUCKET_NAME       — bucket name
 *   R2_PUBLIC_URL        — public URL prefix, e.g. https://pub-xxx.r2.dev
 *                          (used to build permanent download links)
 */

import { S3Client } from "@aws-sdk/client-s3";

export function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error("R2_ACCOUNT_ID not set");

  return new S3Client({
    region:   "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export const R2_BUCKET = () => {
  const name = process.env.R2_BUCKET_NAME;
  if (!name) throw new Error("R2_BUCKET_NAME not set");
  return name;
};

export const R2_PUBLIC_URL = () => process.env.R2_PUBLIC_URL ?? "";
