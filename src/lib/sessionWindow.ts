/**
 * Session state — single source of truth.
 *
 * Rule: a session is scannable on its calendar day in Asia/Tashkent.
 * No time-based open/close window — scanning is allowed any time that day.
 * Late status is computed separately in lateDetection.ts.
 *
 * States:
 *   active      — today (Tashkent) === session date, not cancelled
 *   upcoming    — session date is in the future
 *   ended       — session date is in the past
 *   cancelled   — isCancelled = true (admin override)
 *   force_closed — forceClosed = true (admin override)
 */

import type { SessionState } from "@/types";
export type { SessionState };

// ─── Constants ────────────────────────────────────────────────────────────────

export const TIMEZONE = "Asia/Tashkent"; // UTC+5, no DST

// Kept for interface compatibility with existing callers; no longer drives logic
export interface SystemWindowSettings {
  before: number;
  after: number;
  timezone: string;
}

export interface SessionWindowInput {
  sessionDate: string;   // "YYYY-MM-DD" plain text — no timezone conversion
  sessionTime: string;   // "HH:MM" — for display and late calculation only
  isCancelled?: boolean;
  forceClosed?: boolean;
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Today's date string in Asia/Tashkent (UTC+5, no DST).
 * Safe to call on both server and client.
 */
export function getTodayInTashkent(now: Date = new Date()): string {
  const localMs = now.getTime() + 5 * 60 * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Derive the current state of a session.
 *
 * This is THE only place session state is computed — every feature calls this.
 *
 * @param session  - Needs sessionDate ("YYYY-MM-DD"), isCancelled, forceClosed
 * @param _settings - Ignored (kept for call-site compatibility)
 * @param now      - Reference time (default: new Date()); injectable for testing
 */
export function getSessionState(
  session: SessionWindowInput,
  _settings?: Partial<SystemWindowSettings>,
  now: Date = new Date()
): SessionState {
  if (session.isCancelled) return "cancelled";
  if (session.forceClosed) return "force_closed";

  const today = getTodayInTashkent(now);
  const date  = session.sessionDate.slice(0, 10);

  if (date === today) return "active";
  if (date >  today)  return "upcoming";
  return "ended";
}

/**
 * Format seconds as MM:SS or HH:MM:SS.
 */
export function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Convert a UTC DateTime to a "YYYY-MM-DD" date string in Asia/Tashkent (UTC+5, no DST).
 * Use this instead of d.toISOString().slice(0,10) which gives the UTC date, not local.
 */
export function toTashkentDateStr(d: Date): string {
  const shifted = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

// NOTE: loadSystemWindowSettings() lives in sessionWindow.server.ts (server-only).
// Do NOT import Prisma from this file — it is used by client components.
