export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";
import { getTodayInTashkent } from "@/lib/sessionWindow";

function dateNDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const daysParam = Number(searchParams.get("days") ?? "7");
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 7;

  const today = getTodayInTashkent();
  const todayStart = new Date(`${today}T00:00:00+05:00`);
  const day7Start = dateNDaysAgo(7);
  const day30Start = dateNDaysAgo(30);
  const windowStart = dateNDaysAgo(days);

  // ── Active users ──────────────────────────────────────────────────────────
  const [dauRaw, wauRaw, mauRaw, totalRaw, totalMessages] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "chat_id") AS count
      FROM bot_messages
      WHERE created_at >= ${todayStart}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "chat_id") AS count
      FROM bot_messages
      WHERE created_at >= ${day7Start}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "chat_id") AS count
      FROM bot_messages
      WHERE created_at >= ${day30Start}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "chat_id") AS count
      FROM bot_messages
    `,
    prisma.botMessage.count(),
  ]);

  // ── Quality ───────────────────────────────────────────────────────────────
  const ratings = await prisma.botMessageRating.findMany({
    select: { stars: true },
  });

  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let starSum = 0;
  for (const r of ratings) {
    const k = String(r.stars);
    if (k in distribution) distribution[k]++;
    starSum += r.stars;
  }
  const avgStars = ratings.length > 0 ? starSum / ratings.length : null;

  // ── Cost ──────────────────────────────────────────────────────────────────
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+05:00`);

  let llmUsd = 0;
  let ttsUsd = 0;

  try {
    const costRows = await (prisma as any).botUsageLog.groupBy({
      by: ["kind"],
      where: { createdAt: { gte: monthStart } },
      _sum: { costUsd: true },
    }) as Array<{ kind: string; _sum: { costUsd: { toNumber?: () => number } | null } }>;

    for (const row of costRows) {
      const usd = row._sum.costUsd
        ? (typeof row._sum.costUsd === "object" && "toNumber" in row._sum.costUsd
            ? row._sum.costUsd.toNumber!()
            : Number(row._sum.costUsd))
        : 0;
      if (row.kind === "tts") {
        ttsUsd += usd;
      } else {
        llmUsd += usd;
      }
    }
  } catch {
    // table not yet migrated — return zeros
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  const timelineRows = await prisma.$queryRaw<
    { date: string; message_count: bigint }[]
  >`
    SELECT
      TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS date,
      COUNT(*) AS message_count
    FROM bot_messages
    WHERE role = 'user'
      AND created_at >= ${windowStart}
    GROUP BY 1
    ORDER BY 1
  `;

  const timelineCostMap: Record<string, number> = {};
  try {
    const costTimeline = await prisma.$queryRaw<
      { date: string; cost_usd: string }[]
    >`
      SELECT
        TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS date,
        SUM(cost_usd)::text AS cost_usd
      FROM bot_usage_log
      WHERE created_at >= ${windowStart}
      GROUP BY 1
    `;
    for (const r of costTimeline) {
      timelineCostMap[r.date] = parseFloat(r.cost_usd ?? "0");
    }
  } catch {
    // table not yet migrated — leave costs as zero
  }

  const timeline = timelineRows.map((r) => ({
    date: r.date,
    message_count: Number(r.message_count),
    cost_usd: timelineCostMap[r.date] ?? 0,
  }));

  return NextResponse.json({
    active: {
      dau: Number(dauRaw[0]?.count ?? 0),
      wau: Number(wauRaw[0]?.count ?? 0),
      mau: Number(mauRaw[0]?.count ?? 0),
      total_users: Number(totalRaw[0]?.count ?? 0),
      total_messages: totalMessages,
    },
    cost: {
      llm_usd: llmUsd,
      tts_usd: ttsUsd,
      total_usd: llmUsd + ttsUsd,
      month_start: today.slice(0, 7) + "-01",
    },
    quality: {
      total_ratings: ratings.length,
      avg_stars: avgStars !== null ? Math.round(avgStars * 100) / 100 : null,
      distribution,
    },
    timeline,
  });
}
