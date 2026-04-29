import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { deleteR2ObjectByPublicUrl } from "@/lib/r2Upload";

export const dynamic = "force-dynamic";

function serializeHw(hw: {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  startDate: string | null;
  hardCloseAt: string | null;
  allowLateSubmission: boolean;
  latePenaltyPercent: number | null;
  maxScore: number;
  createdAt: Date;
  trainingId: string;
}) {
  return {
    id: hw.id,
    title: hw.title,
    description: hw.description,
    due_date: hw.dueDate,
    start_date: hw.startDate,
    hard_close_at: hw.hardCloseAt,
    allow_late_submission: hw.allowLateSubmission,
    late_penalty_percent: hw.latePenaltyPercent,
    max_score: hw.maxScore,
    created_at: hw.createdAt,
    training_id: hw.trainingId,
  };
}

// DELETE /api/homeworks/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "delete"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Gather R2 URLs across all child submissions' files BEFORE cascade delete
  const files = await prisma.homeworkFile.findMany({
    where:  { submission: { homeworkId: id }, storageUrl: { not: null } },
    select: { storageUrl: true },
  });

  await prisma.homework.delete({ where: { id } });

  // Fire-and-forget R2 cleanup
  for (const f of files) {
    if (f.storageUrl) void deleteR2ObjectByPublicUrl(f.storageUrl);
  }

  return new NextResponse(null, { status: 204 });
}

// PATCH /api/homeworks/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "trainings", "edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (body.title                !== undefined) data.title               = String(body.title).trim();
  if (body.description          !== undefined) data.description         = body.description?.trim() || null;
  if (body.due_date             !== undefined) data.dueDate             = body.due_date || null;
  if (body.start_date           !== undefined) data.startDate           = body.start_date || null;
  if (body.hard_close_at        !== undefined) data.hardCloseAt         = body.hard_close_at || null;
  if (body.allow_late_submission !== undefined) data.allowLateSubmission = Boolean(body.allow_late_submission);
  if (body.late_penalty_percent !== undefined) data.latePenaltyPercent  = body.late_penalty_percent === null ? null : Number(body.late_penalty_percent);
  if (body.max_score            !== undefined) data.maxScore            = Number(body.max_score);

  const updated = await prisma.homework.update({ where: { id }, data });

  return NextResponse.json(serializeHw(updated));
}
