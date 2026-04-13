/**
 * GET  /api/activity?sessionId=<id>   — list scores for a session
 * POST /api/activity                  — upsert a score
 * DELETE /api/activity?sessionId=&participantId=  — remove a score
 */

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

export async function GET(req: NextRequest) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const scores = await prisma.activityScore.findMany({
    where:   { sessionId },
    include: { participant: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    scores.map((s) => ({
      id:             s.id,
      sessionId:      s.sessionId,
      participantId:  s.participantId,
      participantName: s.participant.fullName,
      score:          s.score,
      note:           s.note,
      created_at:     s.createdAt,
    }))
  );
}

export async function POST(req: NextRequest) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { sessionId, participantId, score, note } = body;

  if (!sessionId || !participantId || typeof score !== "number") {
    return NextResponse.json({ error: "sessionId, participantId, score required" }, { status: 400 });
  }
  if (score < 0 || score > 100) {
    return NextResponse.json({ error: "score must be 0–100" }, { status: 400 });
  }

  const result = await prisma.activityScore.upsert({
    where:  { sessionId_participantId: { sessionId, participantId } },
    update: { score, note: note?.trim() || null, enteredById: user.sub },
    create: { sessionId, participantId, score, note: note?.trim() || null, enteredById: user.sub },
  });

  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId     = req.nextUrl.searchParams.get("sessionId");
  const participantId = req.nextUrl.searchParams.get("participantId");

  if (!sessionId || !participantId) {
    return NextResponse.json({ error: "sessionId and participantId required" }, { status: 400 });
  }

  await prisma.activityScore.deleteMany({
    where: { sessionId, participantId },
  });

  return new NextResponse(null, { status: 204 });
}
