import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portalAuth";
import { getTodayInTashkent } from "@/lib/sessionWindow";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ hwId: string }> }
) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hwId } = await params;

  const hw = await prisma.homework.findUnique({
    where:   { id: hwId },
    include: {
      submissions: {
        where:   { participantId: user.sub },
        include: { grade: true },
      },
    },
  });

  if (!hw) return NextResponse.json({ error: "Homework not found" }, { status: 404 });

  const sub = hw.submissions[0];
  if (!sub) return NextResponse.json({ error: "No submission found" }, { status: 404 });

  // Cannot delete a graded submission
  if (sub.grade) {
    return NextResponse.json(
      { error: "Baholangan topshiriqni o'chirib bo'lmaydi" },
      { status: 403 }
    );
  }

  // Cannot delete if due date has passed
  if (hw.dueDate) {
    const today = getTodayInTashkent();
    if (hw.dueDate < today) {
      return NextResponse.json(
        { error: "Muddati o'tgan topshiriqni o'chirib bo'lmaydi" },
        { status: 403 }
      );
    }
  }

  // Cascade deletes HomeworkFile and HomeworkGrade
  await prisma.homeworkSubmission.delete({ where: { id: sub.id } });

  return NextResponse.json({ success: true });
}
