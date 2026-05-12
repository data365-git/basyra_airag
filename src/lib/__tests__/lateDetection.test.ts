import { describe, it, expect, vi } from "vitest";

// Mock prisma so the top-level import in lateDetection.ts doesn't attempt a DB connection
vi.mock("@/lib/prisma", () => ({
  default: {
    systemSetting: {
      findUnique: vi.fn(),
    },
  },
}));

import { parseLateThreshold, computeAttendanceStatus } from "../lateDetection";

describe("parseLateThreshold", () => {
  it("parses valid integer", () => expect(parseLateThreshold("15")).toBe(15));
  it("clamps to 0 minimum", () => expect(parseLateThreshold("-5")).toBe(0));
  it("clamps to 120 maximum", () => expect(parseLateThreshold("999")).toBe(120));
  it("returns null for NaN", () => expect(parseLateThreshold("abc")).toBeNull());
  it("returns null for empty string", () => expect(parseLateThreshold("")).toBeNull());
});

describe("computeAttendanceStatus", () => {
  // Session: 2026-04-25, 09:00 Tashkent time = 04:00 UTC
  const sessionDate = "2026-04-25";
  const sessionTime = "09:00";
  const threshold = 15;

  it("returns present when scanned exactly on time", () => {
    const scannedAt = new Date("2026-04-25T04:00:00Z"); // exactly 09:00 Tashkent
    const result = computeAttendanceStatus(scannedAt, sessionDate, sessionTime, threshold);
    expect(result.status).toBe("present");
    expect(result.minutesLate).toBe(0);
  });

  it("returns present when scanned within threshold", () => {
    const scannedAt = new Date("2026-04-25T04:14:00Z"); // 09:14 Tashkent, 14 min late
    const result = computeAttendanceStatus(scannedAt, sessionDate, sessionTime, threshold);
    expect(result.status).toBe("present");
  });

  it("returns late when scanned past threshold", () => {
    const scannedAt = new Date("2026-04-25T04:20:00Z"); // 09:20 Tashkent, 20 min late
    const result = computeAttendanceStatus(scannedAt, sessionDate, sessionTime, threshold);
    expect(result.status).toBe("late");
    expect(result.minutesLate).toBe(20);
  });

  it("returns present when threshold is 0 (disabled)", () => {
    const scannedAt = new Date("2026-04-25T06:00:00Z"); // 11:00 Tashkent, very late
    const result = computeAttendanceStatus(scannedAt, sessionDate, sessionTime, 0);
    expect(result.status).toBe("present");
    expect(result.minutesLate).toBe(0);
  });

  it("returns present when scanned early", () => {
    const scannedAt = new Date("2026-04-25T03:30:00Z"); // 08:30 Tashkent, 30 min early
    const result = computeAttendanceStatus(scannedAt, sessionDate, sessionTime, threshold);
    expect(result.status).toBe("present");
    expect(result.minutesLate).toBe(0);
  });
});
