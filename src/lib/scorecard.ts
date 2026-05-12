import prisma from "@/lib/prisma";
import { getTodayInTashkent, toTashkentDateStr } from "@/lib/sessionWindow";

export interface AttendanceStat {
  total:   number;
  present: number;
  late:    number;
  excused: number;
  absent:  number;
  rate:    number; // 0-100 — (present+late+excused) / total
}

export interface HomeworkStat {
  total:                   number;
  submitted:               number;
  graded:                  number;
  avgScore:                number | null; // 0-100 curator-graded; null if no grades yet
  submitRate:              number;        // 0-100
  deadlineComplianceRate:  number | null; // 0-100; null if no homeworks have a due date
  onTimeCount:             number;
  deadlineEligibleCount:   number;
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
        id:         true,
        maxScore:   true,
        dueDate:    true,
        submissions: {
          where:  { participantId },
          select: {
            id:          true,
            submittedAt: true,
            grade: { select: { score: true } },
          },
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
  let deadlineEligible = 0;
  let onTimeCount = 0;

  for (const hw of homeworks) {
    const sub = hw.submissions[0];

    // Task score (curator-graded raw percentage)
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

    // Deadline compliance — binary, only for homeworks that have a dueDate
    if (hw.dueDate) {
      if (hw.dueDate >= today) {
        // Deadline hasn't passed yet — don't penalize unsubmitted, don't count early ones either
        // Only count if already submitted
        if (sub) {
          deadlineEligible++;
          const submittedDate = toTashkentDateStr(sub.submittedAt);
          if (submittedDate <= hw.dueDate) onTimeCount++;
        }
        // else: not yet due and not submitted → skip (defer)
      } else {
        // Deadline has passed
        deadlineEligible++;
        if (sub) {
          const submittedDate = toTashkentDateStr(sub.submittedAt);
          if (submittedDate <= hw.dueDate) onTimeCount++;
          // else: submitted late → 0 (don't increment onTimeCount)
        }
        // else: past due, not submitted → counts as 0
      }
    }
  }

  const hwTotal                = homeworks.length;
  const hwAvg                  = hwGraded          > 0 ? Math.round(hwScoreSum / hwGraded)         : null;
  const hwSubmitRate           = hwTotal            === 0 ? 0 : Math.round((hwSubmitted / hwTotal) * 100);
  const deadlineComplianceRate = deadlineEligible   > 0 ? Math.round((onTimeCount / deadlineEligible) * 100) : null;

  // ── Activity ──────────────────────────────────────────────────────────────
  const actCount = activityScores.length;
  const actAvg   = actCount > 0
    ? Math.round(activityScores.reduce((s, r) => s + r.score, 0) / actCount)
    : null;

  // ── Overall — equal thirds: attendance + task score + deadline compliance ──
  const taskComponent     = hwAvg                  ?? 0;
  const deadlineComponent = deadlineComplianceRate ?? 0;
  // Overall = equal thirds: attendance + task score + deadline compliance.
  // Activity (actAvg) is retained in the payload for curator display, not in overall.
  const overall = Math.round((attRate + taskComponent + deadlineComponent) / 3);

  return {
    participantId,
    trainingId,
    attendance: { total, present, late, excused, absent, rate: attRate },
    homework: {
      total:                  hwTotal,
      submitted:              hwSubmitted,
      graded:                 hwGraded,
      avgScore:               hwAvg,
      submitRate:             hwSubmitRate,
      deadlineComplianceRate,
      onTimeCount,
      deadlineEligibleCount:  deadlineEligible,
    },
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
