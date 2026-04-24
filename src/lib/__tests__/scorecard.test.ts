import { describe, it, expect, vi } from "vitest";

// Mock prisma before any module that imports it
vi.mock("@/lib/prisma", () => ({
  default: {
    gradingPolicy: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    systemSetting: {
      findUnique: vi.fn(),
    },
  },
}));

import { toTashkentDateStr } from "../sessionWindow";
import {
  computeTimelinessPct,
  computeFinalPct,
  type GradingPolicyData,
} from "../gradingPolicy";

describe("toTashkentDateStr", () => {
  it("converts UTC midnight to same Tashkent date (UTC+5 = 05:00 Tashkent)", () => {
    // UTC 00:00 Apr 25 = Tashkent 05:00 Apr 25 — same day
    const utcMidnight = new Date("2026-04-25T00:00:00Z");
    expect(toTashkentDateStr(utcMidnight)).toBe("2026-04-25");
  });

  it("converts UTC 23:00 Apr 24 (Tashkent 04:00 Apr 25) correctly", () => {
    // UTC 23:00 Apr 24 = Tashkent 04:00 Apr 25
    const d = new Date("2026-04-24T23:00:00Z");
    expect(toTashkentDateStr(d)).toBe("2026-04-25");
  });

  it("converts UTC 18:59 Apr 25 (Tashkent 23:59 same day)", () => {
    // UTC 18:59 = Tashkent 23:59 same day
    const d = new Date("2026-04-25T18:59:00Z");
    expect(toTashkentDateStr(d)).toBe("2026-04-25");
  });

  it("converts UTC 19:00 Apr 25 (Tashkent 00:00 Apr 26 — next day)", () => {
    // UTC 19:00 Apr 25 = Tashkent 00:00 Apr 26
    const d = new Date("2026-04-25T19:00:00Z");
    expect(toTashkentDateStr(d)).toBe("2026-04-26");
  });
});

describe("computeTimelinessPct", () => {
  const policy: GradingPolicyData = {
    id: "test",
    onTimePct: 100,
    sameDayPct: 90,
    perDayLatePenaltyPct: 10,
    lateFloorPct: 50,
    earlyBonusPct: 5,
    earlyBonusDays: 2,
  };

  it("returns 0 when no submission", () => {
    expect(computeTimelinessPct(null, "2026-04-25", policy)).toBe(0);
  });

  it("returns onTimePct when no due date", () => {
    const submitted = new Date("2026-04-25T04:00:00Z");
    expect(computeTimelinessPct(submitted, null, policy)).toBe(100);
  });

  it("returns sameDayPct when submitted on the due date", () => {
    // Submit at 14:00 UTC (19:00 Tashkent) = still Apr 25 Tashkent
    const submitted = new Date("2026-04-25T09:00:00Z");
    expect(computeTimelinessPct(submitted, "2026-04-25", policy)).toBe(90);
  });

  it("returns onTimePct when submitted early (not enough days for bonus)", () => {
    // 1 day early — earlyBonusDays is 2, so no bonus
    const submitted = new Date("2026-04-24T09:00:00Z"); // Apr 24 UTC = Apr 24 Tashkent
    expect(computeTimelinessPct(submitted, "2026-04-25", policy)).toBe(100);
  });

  it("returns onTimePct + earlyBonusPct when submitted early enough", () => {
    // 3 days early (>= earlyBonusDays=2), earlyBonusPct=5 → 105 capped to 100? No, min(100, 100+5)=100
    // With onTimePct=100 + earlyBonusPct=5 = min(100, 105) = 100
    const submitted = new Date("2026-04-22T09:00:00Z"); // 3 days early
    expect(computeTimelinessPct(submitted, "2026-04-25", policy)).toBe(100);
  });

  it("applies early bonus correctly when onTimePct < 100", () => {
    const policy95: GradingPolicyData = { ...policy, onTimePct: 95 };
    // 3 days early → 95 + 5 = 100
    const submitted = new Date("2026-04-22T09:00:00Z");
    expect(computeTimelinessPct(submitted, "2026-04-25", policy95)).toBe(100);
  });

  it("applies penalty for 1 day late", () => {
    // 1 day late → 100 - 1*10 = 90, but sameDayPct is for daysDelta===0, so daysDelta=1 → penalty
    const submitted = new Date("2026-04-26T09:00:00Z"); // Apr 26 Tashkent
    expect(computeTimelinessPct(submitted, "2026-04-25", policy)).toBe(90);
  });

  it("applies floor when penalty is large enough", () => {
    // 6 days late → 100 - 6*10 = 40, but floor is 50
    const submitted = new Date("2026-05-01T09:00:00Z"); // 6 days late
    expect(computeTimelinessPct(submitted, "2026-04-25", policy)).toBe(50);
  });
});

describe("computeFinalPct", () => {
  it("multiplies rawPct by timelinessPct/100", () => {
    expect(computeFinalPct(80, 100)).toBe(80);
    expect(computeFinalPct(80, 90)).toBe(72);
    expect(computeFinalPct(100, 50)).toBe(50);
    expect(computeFinalPct(0, 100)).toBe(0);
  });
});
