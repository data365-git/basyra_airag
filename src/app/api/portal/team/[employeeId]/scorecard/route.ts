import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPortalUser } from "@/lib/portalAuth";
import { getParticipantScorecard } from "@/lib/scorecard";
import { getTodayInTashkent } from "@/lib/sessionWindow";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const user = await getPortalUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { employeeId } = await params;
  const supervisorLink = await prisma.supervisorLink.findFirst({
    where: { bossId: user.sub, reportId: employeeId },
    select: { id: true },
  });

  if (!supervisorLink) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employee = await prisma.participant.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      trainingParticipants: {
        include: {
          training: {
            select: { id: true, name: true, color: true, status: true },
          },
        },
        orderBy: { enrolledAt: "asc" },
      },
    },
  });

  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const today = getTodayInTashkent();
  const trainings = await Promise.all(
    employee.trainingParticipants.map(async ({ training }) => {
      const [scorecard, attendanceHistory, homeworks] = await Promise.all([
        getParticipantScorecard(employee.id, training.id),
        prisma.attendance.findMany({
          where: {
            participantId: employee.id,
            session: {
              trainingId: training.id,
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
        prisma.homework.findMany({
          where: { trainingId: training.id },
          orderBy: [
            { dueDate: { sort: "asc", nulls: "last" } },
            { createdAt: "asc" },
          ],
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            maxScore: true,
            submissions: {
              where: { participantId: employee.id },
              select: {
                id: true,
                submittedAt: true,
                isLate: true,
                lateByDays: true,
                grade: { select: { score: true, feedback: true } },
              },
            },
          },
        }),
      ]);

      return {
        training: {
          id: training.id,
          name: training.name,
          color: training.color,
          status: training.status,
        },
        scorecard: {
          ...scorecard,
          attendanceHistory: attendanceHistory.map((row) => ({
            date: row.session.sessionDate,
            session_number: row.session.sessionNumber,
            status: row.status,
          })),
          homeworks: homeworks.map((homework) => {
            const submission = homework.submissions[0] ?? null;
            return {
              id: homework.id,
              title: homework.title,
              description: homework.description,
              due_date: homework.dueDate,
              max_score: homework.maxScore,
              submission: submission ? {
                id: submission.id,
                submitted_at: submission.submittedAt,
                is_late: submission.isLate,
                late_by_days: submission.lateByDays,
                grade: submission.grade ? {
                  score: submission.grade.score,
                  feedback: submission.grade.feedback,
                } : null,
              } : null,
            };
          }),
        },
      };
    }),
  );

  return NextResponse.json({
    employee: {
      id: employee.id,
      full_name: employee.fullName,
      phone: employee.phone,
    },
    trainings,
  });
}
