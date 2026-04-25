/**
 * In-memory per-chat state shared across handler modules.
 * These maps live for the lifetime of the server process.
 */

// ─── Pending submission state (in-memory, per chatId) ────────────────────────
export const pendingSubmissions = new Map<string, { homeworkId: string; submissionId: string | null }>();

// ─── Pending file awaiting confirmation (in-memory, per chatId) ───────────────
// Set when user sends a file; cleared after confirm/reject/cancel.
export interface PendingFile {
  submissionId: string;
  fileName:     string;
  fileType:     string;
  fileSizeBytes: number | null;
  telegramFileId: string | null;
}
export const pendingFiles = new Map<string, PendingFile>();

// ─── Pending rating comment (waiting for "Boshqa" free-text) ─────────────────
// Key: chatId string. Value: botMessageId waiting for comment.
export const pendingRatingComment = new Map<string, string>();
