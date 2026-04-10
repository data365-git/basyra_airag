import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [participantsCount, trainings, todaysSessions, recentAttendance] = await Promise.all([
    prisma.participant.count(),
    prisma.training.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.session.findMany({
      where: {
        sessionDate: { gte: today, lt: tomorrow },
      },
      include: {
        training: { select: { id: true, name: true, color: true } },
      },
      orderBy: { sessionTime: "asc" },
    }),
    prisma.attendance.findMany({
      where: { status: "present" },
      include: {
        participant: { select: { fullName: true } },
        session: {
          select: {
            sessionNumber: true,
            training: { select: { name: true, color: true } },
          },
        },
      },
      orderBy: { scannedAt: "desc" },
      take: 20,
    }),
  ]);

  const active = trainings.filter((t) => t.status === "active");

  // Compute alerts for active trainings
  const alerts: Array<{
    participantId: string;
    participantName: string;
    trainingId: string;
    trainingName: string;
    rate: number;
    threshold: number;
  }> = [];

  for (const training of active) {
    const [enrolled, closedSessions] = await Promise.all([
      prisma.trainingParticipant.findMany({
        where: { trainingId: training.id },
        include: { participant: { select: { id: true, fullName: true } } },
      }),
      prisma.session.findMany({
        where: { trainingId: training.id, status: "closed" },
        select: { id: true },
      }),
    ]);

    if (!closedSessions.length) continue;
    const sessionIds = closedSessions.map((s) => s.id);

    for (const e of enrolled) {
      const presentCount = await prisma.attendance.count({
        where: {
          participantId: e.participantId,
          sessionId: { in: sessionIds },
          status: { in: ["present", "late"] },
        },
      });
      const rate = Math.round((presentCount / sessionIds.length) * 100);
      if (rate < training.attendanceThreshold) {
        alerts.push({
          participantId: e.participantId,
          participantName: e.participant.fullName,
          trainingId: training.id,
          trainingName: training.name,
          rate,
          threshold: training.attendanceThreshold,
        });
      }
    }
  }

  return NextResponse.json({
    stats: {
      totalParticipants: participantsCount,
      totalTrainings: trainings.length,
      activeTrainings: active.length,
      avgRate: 0,
    },
    todaysSessions: todaysSessions.map((s) => ({
      id: s.id,
      session_number: s.sessionNumber,
      session_date: s.sessionDate.toISOString().slice(0, 10),
      session_time: s.sessionTime,
      status: s.status,
      training: s.training,
    })),
    recentActivity: recentAttendance.map((r) => ({
      id: r.id,
      status: r.status,
      scanned_at: r.scannedAt,
      participant: { full_name: r.participant.fullName },
      session: {
        session_number: r.session.sessionNumber,
        training: r.session.training,
      },
    })),
    activeTrainings: active.slice(0, 4).map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      status: t.status,
      start_date: t.startDate.toISOString().slice(0, 10),
      end_date: t.endDate.toISOString().slice(0, 10),
    })),
    alerts,
  });
}
