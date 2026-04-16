import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getStaffUser() {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return token ? verifyJWT(token) : null;
}

// GET /api/homeworks/[id]/submissions/[subId]/events
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subId: submissionId } = await params;

  // Verify submission exists
  const sub = await prisma.homeworkSubmission.findUnique({
    where:  { id: submissionId },
    select: { id: true },
  });
  if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  const events = await prisma.submissionEvent.findMany({
    where:   { submissionId },
    orderBy: { createdAt: "desc" },
    select: {
      id:        true,
      eventType: true,
      actorName: true,
      actorRole: true,
      meta:      true,
      createdAt: true,
    },
  });

  return NextResponse.json(events);
}
