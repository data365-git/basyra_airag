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

export interface Scorecard {
  participantId: string;
  trainingId:    string;
  attendance:    AttendanceStat;
  homework:      HomeworkStat;
  overallScore:  number; // 70 % attendance + 30 % homework
}

// ─── Single participant scorecard ─────────────────────────────────────────────

export async function getParticipantScorecard(
  participantId: string,
  trainingId:    string,
): Promise<Scorecard> {
  const [sessionIds, attendanceRecords, homeworks] = await Promise.all([
    // All non-cancelled sessions for the training
    prisma.session.findMany({
      where: { trainingId, isCancelled: false, forceClosed: false },
      select: { id: true },
    }),
    // Attendance records for this participant in this training
    prisma.attendance.findMany({
      where: { participantId, session: { trainingId } },
      select: { status: true },
    }),
    // Homeworks with this participant's submission + grade
    prisma.homework.findMany({
      where: { trainingId },
      select: {
        id:       true,
        maxScore: true,
        submissions: {
          where:  { participantId },
          select: { id: true, grade: { select: { score: true } } },
        },
      },
    }),
  ]);

  // ── Attendance ────────────────────────────────────────────────────────────
  const total = sessionIds.length;
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
  const hwAvg        = hwGraded > 0 ? Math.round(hwScoreSum / hwGraded) : null;
  const hwSubmitRate = hwTotal  === 0 ? 0 : Math.round((hwSubmitted / hwTotal) * 100);

  // ── Overall (70 % att + 30 % hw) ─────────────────────────────────────────
  const hwComponent = hwAvg ?? hwSubmitRate;
  const overall     = Math.round(attRate * 0.7 + hwComponent * 0.3);

  return {
    participantId,
    trainingId,
    attendance: { total, present, late, excused, absent, rate: attRate },
    homework:   { total: hwTotal, submitted: hwSubmitted, graded: hwGraded, avgScore: hwAvg, submitRate: hwSubmitRate },
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
