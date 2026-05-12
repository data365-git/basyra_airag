/**
 * Server-only session helpers (imports Prisma — never bundle in client).
 * Kept for backward compatibility; scan window settings are no longer used
 * for blocking scans (replaced by date-only check in sessionWindow.ts).
 */

import prisma from "@/lib/prisma";
import { TIMEZONE } from "./sessionWindow";
import type { SystemWindowSettings } from "./sessionWindow";

export type { SystemWindowSettings };

/**
 * Load system settings from DB.
 * Returns defaults if settings are missing.
 * @deprecated Scan window blocking is removed; this is kept for any callers
 * that still reference it (e.g. report pages). Returns safe defaults.
 */
export async function loadSystemWindowSettings(): Promise<SystemWindowSettings> {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: ["timezone"] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { before: 0, after: 0, timezone: map["timezone"] ?? TIMEZONE };
  } catch {
    return { before: 0, after: 0, timezone: TIMEZONE };
  }
}
