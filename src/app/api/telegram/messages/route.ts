/**
 * GET /api/telegram/messages?participantId=<id>&limit=50
 * Returns the conversation thread for a participant.
 */

import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const jar   = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const user  = token ? await verifyJWT(token) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const participantId = req.nextUrl.searchParams.get("participantId");
  const limit         = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "100"), 200);

  if (!participantId) return NextResponse.json({ error: "participantId required" }, { status: 400 });

  const messages = await prisma.telegramMessage.findMany({
    where:   { participantId },
    orderBy: { createdAt: "asc" },
    take:    limit,
  });

  return NextResponse.json(
    messages.map((m) => ({
      id:             m.id,
      direction:      m.direction,
      text:           m.text,
      messageType:    m.messageType,
      telegramFileId: m.telegramFileId,
      fileName:       m.fileName,
      fileSizeBytes:  m.fileSizeBytes,
      created_at:     m.createdAt,
    }))
  );
}
