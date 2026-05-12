export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { isSuperadmin } from "@/lib/permissions";
import { invalidateGradingPolicyCache } from "@/lib/gradingPolicy";

const POLICY_ID = "default-grading-policy";

const DEFAULTS = {
  onTimePct: 100,
  sameDayPct: 90,
  perDayLatePenaltyPct: 20,
  lateFloorPct: 10,
  earlyBonusPct: 0,
  earlyBonusDays: 2,
};

function mapPolicy(p: {
  id: string;
  onTimePct: number;
  sameDayPct: number;
  perDayLatePenaltyPct: number;
  lateFloorPct: number;
  earlyBonusPct: number;
  earlyBonusDays: number;
  updatedAt: Date;
  updatedById: string | null;
}) {
  return {
    id: p.id,
    on_time_pct: p.onTimePct,
    same_day_pct: p.sameDayPct,
    per_day_late_penalty_pct: p.perDayLatePenaltyPct,
    late_floor_pct: p.lateFloorPct,
    early_bonus_pct: p.earlyBonusPct,
    early_bonus_days: p.earlyBonusDays,
    updated_at: p.updatedAt,
    updated_by_id: p.updatedById,
  };
}

export async function GET() {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const policy = await prisma.gradingPolicy.findFirst();
    if (!policy) {
      return NextResponse.json({
        id: POLICY_ID,
        on_time_pct: DEFAULTS.onTimePct,
        same_day_pct: DEFAULTS.sameDayPct,
        per_day_late_penalty_pct: DEFAULTS.perDayLatePenaltyPct,
        late_floor_pct: DEFAULTS.lateFloorPct,
        early_bonus_pct: DEFAULTS.earlyBonusPct,
        early_bonus_days: DEFAULTS.earlyBonusDays,
        updated_at: null,
        updated_by_id: null,
      });
    }

    return NextResponse.json(mapPolicy(policy));
  } catch (e) {
    console.error("grading GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSuperadmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();

    const {
      on_time_pct,
      same_day_pct,
      per_day_late_penalty_pct,
      late_floor_pct,
      early_bonus_pct,
      early_bonus_days,
    } = body as Record<string, unknown>;

    // Validate each provided field
    const errors: Record<string, string> = {};

    function validatePct(val: unknown, name: string, max = 100) {
      if (val === undefined || val === null) return undefined;
      if (!Number.isInteger(val) || (val as number) < 0 || (val as number) > max) {
        errors[name] = `Must be an integer between 0 and ${max}`;
        return undefined;
      }
      return val as number;
    }

    const validatedOnTimePct = validatePct(on_time_pct, "on_time_pct");
    const validatedSameDayPct = validatePct(same_day_pct, "same_day_pct");
    const validatedPerDayLatePenaltyPct = validatePct(per_day_late_penalty_pct, "per_day_late_penalty_pct");
    const validatedLateFloorPct = validatePct(late_floor_pct, "late_floor_pct");
    const validatedEarlyBonusPct = validatePct(early_bonus_pct, "early_bonus_pct");
    const validatedEarlyBonusDays = validatePct(early_bonus_days, "early_bonus_days", 30);

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", fields: errors }, { status: 400 });
    }

    // Build update object with only provided fields
    const updates: Partial<typeof DEFAULTS> = {};
    if (validatedOnTimePct !== undefined) updates.onTimePct = validatedOnTimePct;
    if (validatedSameDayPct !== undefined) updates.sameDayPct = validatedSameDayPct;
    if (validatedPerDayLatePenaltyPct !== undefined) updates.perDayLatePenaltyPct = validatedPerDayLatePenaltyPct;
    if (validatedLateFloorPct !== undefined) updates.lateFloorPct = validatedLateFloorPct;
    if (validatedEarlyBonusPct !== undefined) updates.earlyBonusPct = validatedEarlyBonusPct;
    if (validatedEarlyBonusDays !== undefined) updates.earlyBonusDays = validatedEarlyBonusDays;

    const policy = await prisma.gradingPolicy.upsert({
      where: { id: POLICY_ID },
      update: {
        ...updates,
        updatedById: user.id,
      },
      create: {
        id: POLICY_ID,
        ...DEFAULTS,
        ...updates,
        updatedById: user.id,
      },
    });

    invalidateGradingPolicyCache();

    return NextResponse.json(mapPolicy(policy));
  } catch (e) {
    console.error("grading PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
