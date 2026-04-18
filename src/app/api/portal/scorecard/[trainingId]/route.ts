import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portalAuth";
import { getParticipantScorecard } from "@/lib/scorecard";
import { getTodayInTashkent } from "@/lib/sessionWindow";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ trainingId: string }> }
) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trainingId } = await params;
  const today = getTodayInTashkent();

  // Ensure participant is enrolled
  const enrollment = await prisma.trainingParticipant.findUnique({
    where: { trainingId_participantId: { trainingId, participantId: user.sub } },
  });
  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });

  // Scorecard aggregate + per-session history + homeworks (parallel)
  const [sc, attendanceHistory, homeworks] = await Promise.all([
    getParticipantScorecard(user.sub, trainingId),

    // Last 10 sessions with this participant's attendance status
    prisma.attendance.findMany({
      where: {
        participantId: user.sub,
        session: {
          trainingId,
          isCancelled: false,
          forceClosed: false,
          sessionDate: { lte: today },
        },
      },
      select: {
        status: true,
        session: { select: { sessionDate: true, sessionNumber: true } },
      },
      orderBy: { session: { sessionDate: "desc" } },
      take: 10,
    }),

    // Homeworks with submission + grade + file count
    prisma.homework.findMany({
      where:   { trainingId },
      orderBy: { createdAt: "asc" },
      include: {
        submissions: {
          where:   { participantId: user.sub },
          include: {
            grade: true,
            files: { select: { id: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    ...sc,
    attendanceHistory: attendanceHistory.map((r) => ({
      date:           r.session.sessionDate,
      session_number: r.session.sessionNumber,
      status:         r.status,
    })),
    homeworks: homeworks.map((hw) => {
      const sub = hw.submissions[0] ?? null;
      return {
        id:          hw.id,
        title:       hw.title,
        description: hw.description,
        due_date:    hw.dueDate,
        max_score:   hw.maxScore,
        submission: sub ? {
          id:           sub.id,
          text:         sub.text,
          submitted_at: sub.submittedAt,
          is_late:      sub.isLate,
          late_by_days: sub.lateByDays,
          file_count:   sub.files.length,
          grade: sub.grade ? { score: sub.grade.score, feedback: sub.grade.feedback } : null,
        } : null,
      };
    }),
  });
}
