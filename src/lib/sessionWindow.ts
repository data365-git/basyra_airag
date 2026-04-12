/**
 * Session Scan Window — single source of truth for all session lifecycle logic.
 *
 * Rules:
 *   - Session state is ALWAYS derived from the clock, never stored.
 *   - isCancelled / forceClosed are the only stored overrides.
 *   - All time comparisons use Asia/Tashkent timezone.
 *   - Three-level window config: system default → training override.
 *
 * Session states:
 *   upcoming      — window not open yet (before opensAt)
 *   active        — scan window is open (opensAt ≤ now ≤ closesAt)
 *   ended         — window has closed naturally (now > closesAt)
 *   cancelled     — isCancelled = true
 *   force_closed  — forceClosed = true
 */

// date-fns-tz is used for future DST-aware expansions; toZonedTime kept as potential helper
// import { toZonedTime } from "date-fns-tz";
import type { SessionState } from "@/types";

export type { SessionState };

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_WINDOW_BEFORE = 30;   // minutes before session start
export const DEFAULT_WINDOW_AFTER  = 120;  // minutes after session start
export const TIMEZONE = "Asia/Tashkent";

export interface SessionWindowInput {
  sessionDate: Date | string;  // DB Date or YYYY-MM-DD string
  sessionTime: string;         // HH:MM
  isCancelled?: boolean;
  forceClosed?: boolean;
  // Per-training overrides (null/undefined = use system default)
  scanWindowBefore?: number | null;
  scanWindowAfter?: number | null;
}

export interface SessionWindowResult {
  /** When the scan window opens (windowBefore minutes before session start) */
  opensAt: Date;
  /** When the scan window closes (windowAfter minutes after session start) */
  closesAt: Date;
  /** The exact session start moment */
  sessionDateTime: Date;
  /** Effective window size used (resolved) */
  windowBefore: number;
  windowAfter: number;
}

export interface SystemWindowSettings {
  before: number;
  after: number;
  timezone: string;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Build a proper UTC Date from a session date + time, interpreting them as
 * local time in Asia/Tashkent (+05:00).
 *
 * The session date from Postgres is stored as a DB Date (midnight UTC).
 * The session time is a "HH:MM" string representing local (Tashkent) time.
 * We construct a string like "YYYY-MM-DDTHH:MM:00+05:00" and parse it.
 */
function buildSessionDateTime(
  sessionDate: Date | string,
  sessionTime: string
): Date {
  // Get the date portion as YYYY-MM-DD
  const datePart =
    typeof sessionDate === "string"
      ? sessionDate.slice(0, 10)
      : sessionDate.toISOString().slice(0, 10);

  // Asia/Tashkent is always UTC+5 (no DST)
  const iso = `${datePart}T${sessionTime}:00+05:00`;
  return new Date(iso);
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Compute the concrete open/close timestamps for a session's scan window.
 *
 * Priority (highest first):
 *   1. Per-training override (scanWindowBefore / scanWindowAfter)
 *   2. System settings passed in `settings`
 *   3. Hard-coded defaults (DEFAULT_WINDOW_BEFORE / DEFAULT_WINDOW_AFTER)
 */
export function getSessionWindow(
  session: SessionWindowInput,
  settings?: Partial<SystemWindowSettings>
): SessionWindowResult {
  const windowBefore =
    session.scanWindowBefore ??
    settings?.before ??
    DEFAULT_WINDOW_BEFORE;

  const windowAfter =
    session.scanWindowAfter ??
    settings?.after ??
    DEFAULT_WINDOW_AFTER;

  const sessionDateTime = buildSessionDateTime(session.sessionDate, session.sessionTime);
  const opensAt  = new Date(sessionDateTime.getTime() - windowBefore * 60_000);
  const closesAt = new Date(sessionDateTime.getTime() + windowAfter  * 60_000);

  return { opensAt, closesAt, sessionDateTime, windowBefore, windowAfter };
}

/**
 * Derive the current state of a session.
 *
 * This is THE only place session state is computed — every feature calls this.
 *
 * @param session   - Session record (needs sessionDate, sessionTime, isCancelled, forceClosed)
 * @param settings  - System window settings (pulled from SystemSetting table)
 * @param now       - Reference time (default: new Date()); injectable for testing
 */
export function getSessionState(
  session: SessionWindowInput,
  settings?: Partial<SystemWindowSettings>,
  now: Date = new Date()
): SessionState {
  // Overrides take priority over time
  if (session.isCancelled) return "cancelled";
  if (session.forceClosed) return "force_closed";

  const { opensAt, closesAt } = getSessionWindow(session, settings);

  if (now < opensAt)  return "upcoming";
  if (now <= closesAt) return "active";
  return "ended";
}

/**
 * Convenience: seconds until the scan window opens (for countdown display).
 * Returns 0 if already past opensAt.
 */
export function secondsUntilOpen(
  session: SessionWindowInput,
  settings?: Partial<SystemWindowSettings>,
  now: Date = new Date()
): number {
  const { opensAt } = getSessionWindow(session, settings);
  return Math.max(0, Math.floor((opensAt.getTime() - now.getTime()) / 1000));
}

/**
 * Convenience: seconds until the scan window closes (for countdown display).
 * Returns 0 if already past closesAt.
 */
export function secondsUntilClose(
  session: SessionWindowInput,
  settings?: Partial<SystemWindowSettings>,
  now: Date = new Date()
): number {
  const { closesAt } = getSessionWindow(session, settings);
  return Math.max(0, Math.floor((closesAt.getTime() - now.getTime()) / 1000));
}

/**
 * Format seconds as MM:SS or HH:MM:SS string.
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
 * Load system window settings from the DB.
 * Exported for use by API routes.
 */
export async function loadSystemWindowSettings(): Promise<SystemWindowSettings> {
  // Dynamic import to keep this file importable on client side without Prisma
  const { default: prisma } = await import("@/lib/prisma");

  const keys = ["scan_window_before_minutes", "scan_window_after_minutes", "timezone"];
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    before:   parseInt(map["scan_window_before_minutes"] ?? String(DEFAULT_WINDOW_BEFORE), 10) || DEFAULT_WINDOW_BEFORE,
    after:    parseInt(map["scan_window_after_minutes"]  ?? String(DEFAULT_WINDOW_AFTER),  10) || DEFAULT_WINDOW_AFTER,
    timezone: map["timezone"] ?? TIMEZONE,
  };
}
