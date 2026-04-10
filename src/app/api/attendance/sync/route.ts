import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";
import type { PendingScan } from "@/types";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scans }: { scans: PendingScan[] } = await request.json();
  if (!scans?.length) return NextResponse.json({ synced: 0 });

  let synced = 0;
  const errors: string[] = [];

  for (const scan of scans) {
    try {
      const participant = await prisma.participant.findUnique({
        where: { qrToken: scan.qrToken },
        select: { id: true },
      });
      if (!participant) continue;

      const session = await prisma.session.findUnique({
        where: { id: scan.sessionId },
        select: { trainingId: true },
      });
      if (!session) continue;

      const enrollment = await prisma.trainingParticipant.findUnique({
        where: {
          trainingId_participantId: {
            trainingId: session.trainingId,
            participantId: participant.id,
          },
        },
      });
      if (!enrollment) continue;

      const existing = await prisma.attendance.findUnique({
        where: {
          sessionId_participantId: {
            sessionId: scan.sessionId,
            participantId: participant.id,
          },
        },
      });

      if (!existing) {
        await prisma.attendance.create({
          data: {
            sessionId: scan.sessionId,
            participantId: participant.id,
            status: "present",
            scannedAt: new Date(scan.scannedAt),
            scannedById: user.sub,
            syncedFromOffline: true,
          },
        });
        synced++;
      }
    } catch (e) {
      errors.push(String(e));
    }
  }

  return NextResponse.json({ synced, errors });
}
