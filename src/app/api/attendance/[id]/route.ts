import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

const VALID_STATUSES = ["present", "late", "absent", "excused", "pending"] as const;

const PatchAttendanceSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  note: z.string().max(500).optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFullUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Any authenticated user who can manage trainings may override attendance
    if (!hasPermission(user, "trainings", "edit"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = PatchAttendanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status, note } = parsed.data;

    const record = await prisma.attendance.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(note !== undefined ? { note: note || null } : {}),
        overrideById: user.id,
        overrideAt: new Date(),
      },
    });

    return NextResponse.json({
      id: record.id,
      session_id: record.sessionId,
      participant_id: record.participantId,
      status: record.status,
      note: record.note,
    });
  } catch (e) {
    console.error("attendance PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
