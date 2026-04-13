import prisma from "@/lib/prisma";

export interface AttendanceStat {
  total:   number;
  present: number;
  late:    number;
  excused: number;
  absent:  number;
  rate:    number; // 0-100 — (present+late+excused) / total
}

export interface HomeworkStat {
  total:      number;
  submitted:  number;
  graded:     number;
  avgScore:   number | null; // 0-100 normalised; null if no grades yet
  submitRate: number;        // 0-100
}

export interface ActivityStat {
  count:    number;          // sessions where score was recorded
  avgScore: number | null;   // null if no scores recorded yet
}

export interface Scorecard {
  participantId: string;
  trainingId:    string;
  attendance:    AttendanceStat;
  homework:      HomeworkStat;
  activity:      ActivityStat;
  overallScore:  number; // avg of available metrics (each 0–100)
}

// ─── Single participant scorecard ─────────────────────────────────────────────

export async function getParticipantScorecard(
  participantId: string,
  trainingId:    string,
): Promise<Scorecard> {
  const [sessions, attendanceRecords, homeworks, activityScores] = await Promise.all([
    // All non-cancelled sessions for the training
    prisma.session.findMany({
      where:  { trainingId, isCancelled: false, forceClosed: false },
      select: { id: true },
    }),
    // Attendance records for this participant in this training
    prisma.attendance.findMany({
      where:  { participantId, session: { trainingId } },
      select: { status: true },
    }),
    // Homeworks with this participant's submission + grade
    prisma.homework.findMany({
      where:  { trainingId },
      select: {
        id:       true,
        maxScore: true,
        submissions: {
          where:  { participantId },
          select: { id: true, grade: { select: { score: true } } },
        },
      },
    }),
    // Activity scores for this participant across all sessions of this training
    prisma.activityScore.findMany({
      where:  { participantId, session: { trainingId } },
      select: { score: true },
    }),
  ]);

  // ── Attendance ────────────────────────────────────────────────────────────
  const total = sessions.length;
  let present = 0, late = 0, excused = 0, absent = 0;
  for (const rec of attendanceRecords) {
    if      (rec.status === "present")  present++;
    else if (rec.status === "late")     late++;
    else if (rec.status === "excused")  excused++;
    else                                absent++;
  }
  const attRate = total === 0 ? 0 : Math.round(((present + late + excused) / total) * 100);

  // ── Homework ──────────────────────────────────────────────────────────────
  let hwSubmitted = 0, hwGraded = 0, hwScoreSum = 0;
  for (const hw of homeworks) {
    const sub = hw.submissions[0];
    if (sub) {
      hwSubmitted++;
      if (sub.grade) {
        hwGraded++;
        const normalised = hw.maxScore > 0
          ? Math.round((sub.grade.score / hw.maxScore) * 100)
          : sub.grade.score;
        hwScoreSum += normalised;
      }
    }
  }
  const hwTotal      = homeworks.length;
  const hwAvg        = hwGraded   > 0 ? Math.round(hwScoreSum / hwGraded) : null;
  const hwSubmitRate = hwTotal    === 0 ? 0 : Math.round((hwSubmitted / hwTotal) * 100);

  // ── Activity ──────────────────────────────────────────────────────────────
  const actCount = activityScores.length;
  const actAvg   = actCount > 0
    ? Math.round(activityScores.reduce((s, r) => s + r.score, 0) / actCount)
    : null;

  // ── Overall — average of available metrics ────────────────────────────────
  // attendance always counts (defaults to 0 if no sessions)
  // homework counts only when at least one grade exists
  // activity counts only when at least one score exists
  const components: number[] = [attRate];
  if (hwAvg !== null)  components.push(hwAvg);
  if (actAvg !== null) components.push(actAvg);
  const overall = Math.round(components.reduce((s, v) => s + v, 0) / components.length);

  return {
    participantId,
    trainingId,
    attendance: { total, present, late, excused, absent, rate: attRate },
    homework:   { total: hwTotal, submitted: hwSubmitted, graded: hwGraded, avgScore: hwAvg, submitRate: hwSubmitRate },
    activity:   { count: actCount, avgScore: actAvg },
    overallScore: overall,
  };
}

// ─── Leaderboard for all participants in a training ───────────────────────────

export async function getTrainingLeaderboard(trainingId: string) {
  const enrollments = await prisma.trainingParticipant.findMany({
    where:  { trainingId },
    select: { participantId: true, participant: { select: { fullName: true } } },
  });

  const cards = await Promise.all(
    enrollments.map(async (tp) => {
      const sc = await getParticipantScorecard(tp.participantId, trainingId);
      return { ...sc, name: tp.participant.fullName };
    })
  );

  return cards.sort((a, b) => b.overallScore - a.overallScore);
}
