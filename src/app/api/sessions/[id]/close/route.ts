import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(user, "trainings", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const markedAbsent = await prisma.$transaction(async (tx) => {
      const session = await tx.session.update({
        where: { id },
        data: { status: "closed" },
      });

      const [enrolled, existing] = await Promise.all([
        tx.trainingParticipant.findMany({
          where: { trainingId: session.trainingId },
          select: { participantId: true },
        }),
        tx.attendance.findMany({
          where: { sessionId: id },
          select: { participantId: true },
        }),
      ]);

      const existingIds = new Set(existing.map((r) => r.participantId));
      const missingIds = enrolled
        .map((e) => e.participantId)
        .filter((pid) => !existingIds.has(pid));

      if (missingIds.length > 0) {
        await tx.attendance.createMany({
          data: missingIds.map((participantId) => ({
            sessionId: id,
            participantId,
            status: "absent",
          })),
          skipDuplicates: true,
        });
      }

      return missingIds.length;
    });

    return NextResponse.json({ success: true, marked_absent: markedAbsent });
  } catch (e) {
    console.error("session close error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
