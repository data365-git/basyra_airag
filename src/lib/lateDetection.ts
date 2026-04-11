import prisma from "@/lib/prisma";

/** Parse a raw DB string value into an integer, clamped to 0–120. Returns null if invalid. */
export function parseLateThreshold(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (isNaN(n)) return null;
  return Math.min(120, Math.max(0, n));
}

/**
 * Resolve the effective late threshold (in minutes) for a given training.
 * - If the training has its own `lateThresholdMinutes` (not null), use it.
 * - Otherwise, look up the global `late_threshold_minutes` system setting.
 * - Final fallback: 15 minutes.
 */
export async function resolveLateThreshold(
  trainingLateThreshold: number | null | undefined
): Promise<number> {
  if (trainingLateThreshold !== null && trainingLateThreshold !== undefined) {
    return trainingLateThreshold;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "late_threshold_minutes" },
    });
    if (setting) {
      const parsed = parseLateThreshold(setting.value);
      if (parsed !== null) return parsed;
    }
  } catch {
    // If DB lookup fails, fall through to default
  }

  return 15;
}

/**
 * Compute attendance status based on when the participant scanned vs session start.
 *
 * @param scannedAt - The timestamp of the actual scan (device time for offline scans)
 * @param sessionDate - The session date string (YYYY-MM-DD)
 * @param sessionTime - The session time string (HH:MM)
 * @param thresholdMinutes - Resolved threshold (0 = late detection disabled → always "present")
 * @returns "present" | "late" and the number of minutes late (0 if on time)
 */
export function computeAttendanceStatus(
  scannedAt: Date,
  sessionDate: string,
  sessionTime: string,
  thresholdMinutes: number
): { status: "present" | "late"; minutesLate: number } {
  // If threshold is 0, late detection is disabled
  if (thresholdMinutes === 0) {
    return { status: "present", minutesLate: 0 };
  }

  // Build session start time in UTC (sessionDate is stored as a date, sessionTime as "HH:MM")
  const [year, month, day] = sessionDate.split("-").map(Number);
  const [hour, minute] = sessionTime.split(":").map(Number);
  const sessionStart = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const diffMs = scannedAt.getTime() - sessionStart.getTime();
  const minutesLate = Math.floor(diffMs / 60_000);

  if (minutesLate > thresholdMinutes) {
    return { status: "late", minutesLate };
  }

  return { status: "present", minutesLate: 0 };
}
