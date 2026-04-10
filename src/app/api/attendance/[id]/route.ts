import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { status, note } = body;

  const record = await prisma.attendance.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
      overrideById: user.sub,
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
}
