import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portalAuth";
import { getParticipantScorecard } from "@/lib/scorecard";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ trainingId: string }> }
) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trainingId } = await params;

  // Ensure participant is enrolled in this training
  const enrollment = await prisma.trainingParticipant.findUnique({
    where: { trainingId_participantId: { trainingId, participantId: user.sub } },
  });
  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });

  // Scorecard
  const sc = await getParticipantScorecard(user.sub, trainingId);

  // Also return homeworks with submission status for this participant
  const homeworks = await prisma.homework.findMany({
    where:   { trainingId },
    orderBy: { createdAt: "asc" },
    include: {
      submissions: {
        where:   { participantId: user.sub },
        include: { grade: true },
      },
    },
  });

  return NextResponse.json({
    ...sc,
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
          grade: sub.grade ? { score: sub.grade.score, feedback: sub.grade.feedback } : null,
        } : null,
      };
    }),
  });
}
