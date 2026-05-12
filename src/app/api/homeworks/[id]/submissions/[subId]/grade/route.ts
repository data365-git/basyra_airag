import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";
import { notifyGraded } from "@/lib/bot";
import { logSubmissionEvent, SubmissionEventType } from "@/lib/submissionEvents";

async function getStaffUser() {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return token ? verifyJWT(token) : null;
}

// POST/PUT /api/homeworks/[id]/submissions/[subId]/grade
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subId: submissionId } = await params;
  const body = await req.json().catch(() => ({}));
  const { score, feedback } = body;

  if (typeof score !== "number" || !Number.isFinite(score) || score < 0) {
    return NextResponse.json({ error: "score must be a non-negative number" }, { status: 400 });
  }

  // Look up the homework's maxScore so we can validate the upper bound and
  // pass the real value to the Telegram notification (no more hard-coded 100).
  const sub = await prisma.homeworkSubmission.findUnique({
    where:   { id: submissionId },
    include: {
      homework:    { select: { title: true, maxScore: true } },
      participant: { select: { id: true } },
      grade:       { select: { score: true } },
    },
  });
  if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  const maxScore = sub.homework.maxScore;
  if (score > maxScore) {
    return NextResponse.json(
      { error: `score must be ≤ ${maxScore}` },
      { status: 400 }
    );
  }

  const isEdit    = sub.grade !== null;
  const oldScore  = sub.grade?.score ?? null;

  const grade = await prisma.homeworkGrade.upsert({
    where:  { submissionId },
    update: { score, feedback: feedback?.trim() || null, gradedById: user.sub, gradedAt: new Date() },
    create: { submissionId, score, feedback: feedback?.trim() || null, gradedById: user.sub },
  });

  // Log event (non-blocking)
  void logSubmissionEvent(prisma, {
    submissionId,
    actorId:   user.sub,
    actorRole: "curator",
    actorName: user.email ?? "Curator",
    eventType: isEdit ? SubmissionEventType.GRADE_EDITED : SubmissionEventType.GRADED,
    meta:      isEdit
      ? { oldScore, newScore: score, feedback: feedback?.trim() || null }
      : { score, maxScore, feedback: feedback?.trim() || null },
  });

  // Fire Telegram notification (non-blocking)
  notifyGraded({
    participantId: sub.participant.id,
    homeworkTitle: sub.homework.title,
    score,
    maxScore,
    feedback:      feedback?.trim() || null,
  }).catch(() => {});

  return NextResponse.json(grade, { status: 201 });
}

// DELETE — remove a grade (revert to ungraded)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subId: submissionId } = await params;
  await prisma.homeworkGrade.delete({ where: { submissionId } }).catch(() => null);
  void logSubmissionEvent(prisma, {
    submissionId,
    actorId:   user.sub,
    actorRole: "curator",
    actorName: user.email ?? "Curator",
    eventType: SubmissionEventType.GRADE_DELETED,
  });
  return new NextResponse(null, { status: 204 });
}
