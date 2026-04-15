import prisma from "@/lib/prisma";
import { getTodayInTashkent } from "@/lib/sessionWindow";

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
  const today = getTodayInTashkent(); // "YYYY-MM-DD" in Asia/Tashkent

  const [sessions, attendanceRecords, homeworks, activityScores] = await Promise.all([
    // Only sessions that have already happened (today or earlier)
    prisma.session.findMany({
      where:  { trainingId, isCancelled: false, forceClosed: false, sessionDate: { lte: today } },
      select: { id: true },
    }),
    // Attendance records only for past/today sessions
    prisma.attendance.findMany({
      where:  {
        participantId,
        session: { trainingId, isCancelled: false, forceClosed: false, sessionDate: { lte: today } },
      },
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

  // ── Overall — always (attendance + homework + activity) / 3 ─────────────
  // Missing metrics contribute 0, not a smaller denominator. A shrinking
  // denominator would make a student with no homework look the same as one
  // with 100% homework, which is wrong.
  const hwComponent  = hwAvg  ?? 0;
  const actComponent = actAvg ?? 0;
  const overall = Math.round((attRate + hwComponent + actComponent) / 3);

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
