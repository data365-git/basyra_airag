import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";
import type { PendingScan } from "@/types";
import { resolveLateThreshold, computeAttendanceStatus } from "@/lib/lateDetection";

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
        select: {
          trainingId: true,
          sessionDate: true,
          training: { select: { lateThresholdMinutes: true, scheduleTime: true } },
        },
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
        const scannedAt = new Date(scan.scannedAt);
        const threshold = await resolveLateThreshold(session.training.lateThresholdMinutes);
        const sessionDateStr = session.sessionDate.toISOString().slice(0, 10);
        const { status } = computeAttendanceStatus(
          scannedAt,
          sessionDateStr,
          session.training.scheduleTime,
          threshold
        );

        await prisma.attendance.create({
          data: {
            sessionId: scan.sessionId,
            participantId: participant.id,
            status,
            scannedAt,
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
