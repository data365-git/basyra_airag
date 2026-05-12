import { NextResponse } from "next/server";
import { getFullUser } from "@/lib/getUser";
import { getTrainingLeaderboard } from "@/lib/scorecard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leaderboard = await getTrainingLeaderboard(id);

  return NextResponse.json(
    leaderboard.map((entry, idx) => ({
      rank:              idx + 1,
      participant_id:    entry.participantId,
      name:              entry.name,
      overall_score:     entry.overallScore,
      attendance_rate:   entry.attendance.rate,
      hw_avg:            entry.homework.avgScore,
      deadline_rate:     entry.homework.deadlineComplianceRate,
      activity_avg:      entry.activity.avgScore,
      sessions_total:    entry.attendance.total,
      hw_submitted:      entry.homework.submitted,
      hw_total:          entry.homework.total,
    }))
  );
}
