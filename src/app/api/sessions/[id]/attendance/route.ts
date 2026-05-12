import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/sessions/[id]/attendance
 *
 * Returns a lightweight count + list of attendance records for a session.
 * Used by the scanner page to show the live "scanned today" count.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "scanner", "view") && !hasPermission(user, "trainings", "view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const records = await prisma.attendance.findMany({
    where: { sessionId: id },
    select: {
      id:            true,
      participantId: true,
      status:        true,
      scannedAt:     true,
    },
  });

  return NextResponse.json({ count: records.length, records });
}
