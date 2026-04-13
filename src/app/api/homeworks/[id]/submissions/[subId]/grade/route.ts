import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";
import { notifyGraded } from "@/lib/bot";

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

  if (typeof score !== "number" || score < 0) {
    return NextResponse.json({ error: "score required" }, { status: 400 });
  }

  const grade = await prisma.homeworkGrade.upsert({
    where:  { submissionId },
    update: { score, feedback: feedback?.trim() || null, gradedById: user.sub, gradedAt: new Date() },
    create: { submissionId, score, feedback: feedback?.trim() || null, gradedById: user.sub },
  });

  // Fire Telegram notification (non-blocking)
  prisma.homeworkSubmission.findUnique({
    where:   { id: submissionId },
    include: { homework: { select: { title: true, maxScore: true } }, participant: { select: { id: true } } },
  }).then((sub) => {
    if (sub) {
      notifyGraded({
        participantId: sub.participant.id,
        homeworkTitle: sub.homework.title,
        score,
        maxScore:      sub.homework.maxScore,
        feedback:      feedback?.trim() || null,
      }).catch(() => {});
    }
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
  return new NextResponse(null, { status: 204 });
}
