import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getActor() {
  const staff  = await (async () => { const jar = await cookies(); const t = jar.get(COOKIE_NAME)?.value; return t ? verifyJWT(t) : null; })();
  const portal = await getPortalUser();
  return { staff, portal };
}

// GET /api/homeworks/[id]/submissions — staff only, returns all submissions with grades
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { staff } = await getActor();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: homeworkId } = await params;

  const subs = await prisma.homeworkSubmission.findMany({
    where:   { homeworkId },
    orderBy: { submittedAt: "asc" },
    include: {
      participant: { select: { id: true, fullName: true } },
      grade:       true,
    },
  });

  return NextResponse.json(
    subs.map((s) => ({
      id:            s.id,
      participant:   { id: s.participant.id, full_name: s.participant.fullName },
      text:          s.text,
      submitted_at:  s.submittedAt,
      grade: s.grade ? { score: s.grade.score, feedback: s.grade.feedback, graded_at: s.grade.gradedAt } : null,
    }))
  );
}

// POST /api/homeworks/[id]/submissions — portal participant submits their work
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { portal } = await getActor();
  if (!portal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: homeworkId } = await params;
  const body = await req.json().catch(() => ({}));
  const { text } = body;

  const sub = await prisma.homeworkSubmission.upsert({
    where:  { homeworkId_participantId: { homeworkId, participantId: portal.sub } },
    update: { text: text || null },
    create: { homeworkId, participantId: portal.sub, text: text || null },
  });

  return NextResponse.json(sub, { status: 201 });
}
