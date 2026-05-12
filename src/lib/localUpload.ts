/**
 * Local filesystem upload helper — stores files on a Railway Volume
 * mounted at UPLOAD_DIR (default /data/uploads).
 *
 * Returns a public proxy URL `/api/files/<key>` on success, null on failure.
 * The serving route at src/app/api/files/[...path]/route.ts streams the bytes
 * back with proper Content-Type and auth gating.
 */
import fs   from "fs/promises";
import path from "path";

export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./uploads";
}

/** Upload a buffer and return the public proxy URL, or null on failure. */
export async function uploadBufferToLocal(
  buffer:      ArrayBuffer | Uint8Array,
  key:         string,        // e.g. "materials/hwId/1234567890-abc.pdf"
  _contentType: string,
): Promise<string | null> {
  try {
    const filePath = path.join(uploadDir(), key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    await fs.writeFile(filePath, bytes);
    return `/api/files/${key}`;
  } catch (err) {
    console.error("[localUpload] write failed:", err);
    return null;
  }
}

/** Delete a file that was stored via uploadBufferToLocal. */
export async function deleteLocalFile(publicUrl: string): Promise<void> {
  try {
    if (!publicUrl.startsWith("/api/files/")) return;
    const key      = publicUrl.slice("/api/files/".length);
    const filePath = path.join(uploadDir(), key);
    // Prevent path traversal before deleting
    if (!path.resolve(filePath).startsWith(path.resolve(uploadDir()))) return;
    await fs.unlink(filePath);
  } catch { /* already gone — ignore */ }
}
