/**
 * Server-only session window helpers (imports Prisma — never bundle in client).
 *
 * Client components import from sessionWindow.ts.
 * API routes import loadSystemWindowSettings from here.
 */

import prisma from "@/lib/prisma";
import {
  DEFAULT_WINDOW_BEFORE,
  DEFAULT_WINDOW_AFTER,
  TIMEZONE,
} from "./sessionWindow";
import type { SystemWindowSettings } from "./sessionWindow";

export type { SystemWindowSettings };

/**
 * Load system window settings from the DB.
 * Falls back to hard-coded defaults if settings are missing.
 */
export async function loadSystemWindowSettings(): Promise<SystemWindowSettings> {
  const keys = ["scan_window_before_minutes", "scan_window_after_minutes", "timezone"];
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    before:   parseInt(map["scan_window_before_minutes"] ?? String(DEFAULT_WINDOW_BEFORE), 10) || DEFAULT_WINDOW_BEFORE,
    after:    parseInt(map["scan_window_after_minutes"]  ?? String(DEFAULT_WINDOW_AFTER),  10) || DEFAULT_WINDOW_AFTER,
    timezone: map["timezone"] ?? TIMEZONE,
  };
}
