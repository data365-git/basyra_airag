export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";

export async function GET(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const bossId = searchParams.get("bossId");
  const reportId = searchParams.get("reportId");

  const links = await prisma.supervisorLink.findMany({
    where: {
      ...(bossId ? { bossId } : {}),
      ...(reportId ? { reportId } : {}),
    },
    include: {
      boss: { select: { fullName: true } },
      report: { select: { fullName: true } },
      training: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    links.map((l) => ({
      id: l.id,
      boss_id: l.bossId,
      boss_name: l.boss.fullName,
      report_id: l.reportId,
      report_name: l.report.fullName,
      training_id: l.trainingId,
      training_name: l.training?.name ?? null,
      created_at: l.createdAt,
    }))
  );
}

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { boss_id, report_id, training_id } = body as {
    boss_id?: string;
    report_id?: string;
    training_id?: string;
  };

  if (!boss_id || !report_id) {
    return NextResponse.json({ error: "boss_id and report_id are required" }, { status: 400 });
  }

  if (boss_id === report_id) {
    return NextResponse.json({ error: "boss_id and report_id must be different" }, { status: 400 });
  }

  // Validate both participants exist
  const [boss, report] = await Promise.all([
    prisma.participant.findUnique({ where: { id: boss_id } }),
    prisma.participant.findUnique({ where: { id: report_id } }),
  ]);

  if (!boss) return NextResponse.json({ error: "boss_id not found" }, { status: 400 });
  if (!report) return NextResponse.json({ error: "report_id not found" }, { status: 400 });

  // Check for duplicate
  const existing = await prisma.supervisorLink.findFirst({
    where: {
      bossId: boss_id,
      reportId: report_id,
      trainingId: training_id ?? null,
    },
  });
  if (existing) {
    return NextResponse.json({ error: "Link already exists" }, { status: 409 });
  }

  const link = await prisma.supervisorLink.create({
    data: {
      bossId: boss_id,
      reportId: report_id,
      trainingId: training_id ?? null,
      createdById: user.id,
    },
  });

  return NextResponse.json(
    {
      id: link.id,
      boss_id: link.bossId,
      boss_name: boss.fullName,
      report_id: link.reportId,
      report_name: report.fullName,
      training_id: link.trainingId,
      created_at: link.createdAt,
    },
    { status: 201 }
  );
}
