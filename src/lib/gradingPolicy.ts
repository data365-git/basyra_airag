import prisma from "@/lib/prisma";

export interface GradingPolicyData {
  id: string;
  onTimePct: number;
  sameDayPct: number;
  perDayLatePenaltyPct: number;
  lateFloorPct: number;
  earlyBonusPct: number;
  earlyBonusDays: number;
}

// 5-minute in-memory cache (single-row table, rarely changes)
let _cache: GradingPolicyData | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getGradingPolicy(): Promise<GradingPolicyData> {
  if (_cache && Date.now() < _cacheExpiry) return _cache;

  let row = await prisma.gradingPolicy.findFirst();
  if (!row) {
    // Auto-create default row if missing
    row = await prisma.gradingPolicy.create({
      data: { id: "default-grading-policy" },
    });
  }

  _cache = {
    id: row.id,
    onTimePct: row.onTimePct,
    sameDayPct: row.sameDayPct,
    perDayLatePenaltyPct: row.perDayLatePenaltyPct,
    lateFloorPct: row.lateFloorPct,
    earlyBonusPct: row.earlyBonusPct,
    earlyBonusDays: row.earlyBonusDays,
  };
  _cacheExpiry = Date.now() + CACHE_TTL_MS;
  return _cache;
}

export function invalidateGradingPolicyCache() {
  _cache = null;
  _cacheExpiry = 0;
}

/**
 * Compute timeliness percentage (0–100) for a submission.
 *
 * @param submittedAtUtc - ISO string or Date of submission (UTC)
 * @param dueDateStr     - "YYYY-MM-DD" Tashkent-local due date (nullable)
 * @param policy         - grading policy parameters
 * @returns 0–100 timeliness percentage
 */
export function computeTimelinessPct(
  submittedAtUtc: Date | string | null | undefined,
  dueDateStr: string | null | undefined,
  policy: GradingPolicyData,
): number {
  // No submission → 0
  if (!submittedAtUtc) return 0;
  // No due date → always on time
  if (!dueDateStr) return policy.onTimePct;

  // Convert submittedAt to Tashkent date string "YYYY-MM-DD"
  // UTC+5, no DST
  const submitted = typeof submittedAtUtc === "string"
    ? new Date(submittedAtUtc)
    : submittedAtUtc;
  const tashkentOffsetMs = 5 * 60 * 60 * 1000;
  const localMs = submitted.getTime() + tashkentOffsetMs;
  const localDate = new Date(localMs);
  const submittedStr = localDate.toISOString().slice(0, 10);

  // daysDelta: positive = late, negative = early
  const dueTs = new Date(dueDateStr).getTime();
  const subTs = new Date(submittedStr).getTime();
  const daysDelta = Math.round((subTs - dueTs) / (1000 * 60 * 60 * 24));

  // Early (submitted before due date)
  if (daysDelta < 0) {
    const daysEarly = -daysDelta;
    if (policy.earlyBonusPct > 0 && daysEarly >= policy.earlyBonusDays) {
      return Math.min(100, policy.onTimePct + policy.earlyBonusPct);
    }
    return policy.onTimePct;
  }

  // Same day (daysDelta === 0)
  if (daysDelta === 0) return policy.sameDayPct;

  // Late (daysDelta > 0)
  const penalty = daysDelta * policy.perDayLatePenaltyPct;
  return Math.max(policy.lateFloorPct, policy.onTimePct - penalty);
}

/**
 * Apply timeliness to a raw percentage grade.
 * finalPct = rawPct × (timelinessPct / 100)
 */
export function computeFinalPct(rawPct: number, timelinessPct: number): number {
  return rawPct * (timelinessPct / 100);
}
