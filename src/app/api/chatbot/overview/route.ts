export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { getTodayInTashkent } from "@/lib/sessionWindow";

function dateNDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && "toNumber" in value) {
    const decimal = value as { toNumber?: () => number };
    if (typeof decimal.toNumber === "function") return decimal.toNumber();
  }
  return Number(value) || 0;
}

type BotUsageByKindRow = {
  kind: string;
  _sum: { costUsd: unknown; tokensIn: number | null; tokensOut: number | null };
  _avg: { responseTimeMs: number | null };
  _count: { id: number };
};

const botUsageByKind = prisma.botUsageLog as unknown as {
  groupBy(args: {
    by: ["kind"];
    where: { createdAt: { gte: Date } };
    _sum: { costUsd: true; tokensIn: true; tokensOut: true };
    _avg: { responseTimeMs: true };
    _count: { id: true };
  }): Promise<BotUsageByKindRow[]>;
};

export async function GET(request: Request) {
  const user = await getFullUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user, "chatbot", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  let tokensIn = 0;
  let tokensOut = 0;
  let avgResponseTimeMs: number | null = null;
  let ttsCount = 0;
  let topExpensiveUsers: Array<{
    chat_id: string;
    participant_id: string | null;
    full_name: string | null;
    cost_usd: number;
    tokens_in: number;
    tokens_out: number;
  }> = [];

  try {
    const costRows = await botUsageByKind.groupBy({
      by: ["kind"],
      where: { createdAt: { gte: monthStart } },
      _sum: { costUsd: true, tokensIn: true, tokensOut: true },
      _avg: { responseTimeMs: true },
      _count: { id: true },
    });

    let responseTimeSum = 0;
    let responseTimeCount = 0;
    for (const row of costRows) {
      const usd = toNumber(row._sum.costUsd);
      if (row.kind === "tts") {
        ttsUsd += usd;
        ttsCount += row._count.id;
      } else {
        llmUsd += usd;
        tokensIn += row._sum.tokensIn ?? 0;
        tokensOut += row._sum.tokensOut ?? 0;
        if (row._avg.responseTimeMs != null && row._count.id > 0) {
          responseTimeSum += row._avg.responseTimeMs * row._count.id;
          responseTimeCount += row._count.id;
        }
      }
    }
    avgResponseTimeMs = responseTimeCount > 0
      ? Math.round(responseTimeSum / responseTimeCount)
      : null;

    const expensiveRows = await prisma.$queryRaw<
      {
        chat_id: bigint;
        participant_id: string | null;
        full_name: string | null;
        cost_usd: string;
        tokens_in: bigint;
        tokens_out: bigint;
      }[]
    >`
      SELECT
        u.chat_id,
        u.participant_id,
        p.full_name,
        SUM(u.cost_usd)::text AS cost_usd,
        SUM(u.tokens_in) AS tokens_in,
        SUM(u.tokens_out) AS tokens_out
      FROM bot_usage_log u
      LEFT JOIN participants p ON p.id = u.participant_id
      WHERE u.created_at >= ${monthStart}
      GROUP BY u.chat_id, u.participant_id, p.full_name
      HAVING SUM(u.cost_usd) > 0
      ORDER BY SUM(u.cost_usd) DESC
      LIMIT 5
    `;
    topExpensiveUsers = expensiveRows.map((r) => ({
      chat_id: r.chat_id.toString(),
      participant_id: r.participant_id,
      full_name: r.full_name,
      cost_usd: toNumber(r.cost_usd),
      tokens_in: Number(r.tokens_in),
      tokens_out: Number(r.tokens_out),
    }));
  } catch {
    // table not yet migrated — return zeros
  }

  // ── Answer routing / intent richness ──────────────────────────────────────
  const [
    answerRows,
    intentRows,
    unansweredRows,
    lowRatedRows,
    complaintRows,
  ] = await Promise.all([
    prisma.$queryRaw<
      { routed_to: string | null; count: bigint }[]
    >`
      SELECT routed_to, COUNT(*) AS count
      FROM bot_messages
      WHERE role = 'assistant'
        AND created_at >= ${windowStart}
      GROUP BY routed_to
    `,
    prisma.$queryRaw<
      { intent: string; count: bigint }[]
    >`
      SELECT intent, COUNT(*) AS count
      FROM bot_messages
      WHERE intent IS NOT NULL
        AND created_at >= ${windowStart}
      GROUP BY intent
      ORDER BY COUNT(*) DESC
      LIMIT 8
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM bot_messages m
      WHERE m.role = 'user'
        AND m.created_at >= ${windowStart}
        AND NOT EXISTS (
          SELECT 1
          FROM bot_messages a
          WHERE a.chat_id = m.chat_id
            AND a.role = 'assistant'
            AND a.created_at > m.created_at
        )
    `,
    prisma.$queryRaw<
      {
        message_id: string;
        chat_id: bigint;
        content: string;
        stars: number;
        reason: string | null;
        status: string;
        created_at: Date;
      }[]
    >`
      SELECT
        m.id AS message_id,
        m.chat_id,
        COALESCE(q.content, m.content) AS content,
        r.stars,
        r.reason,
        r.status,
        m.created_at
      FROM bot_message_ratings r
      JOIN bot_messages m ON m.id = r.message_id
      LEFT JOIN LATERAL (
        SELECT content
        FROM bot_messages
        WHERE chat_id = m.chat_id
          AND role = 'user'
          AND created_at <= m.created_at
        ORDER BY created_at DESC
        LIMIT 1
      ) q ON true
      WHERE r.stars <= 2
      ORDER BY r.rated_at DESC
      LIMIT 5
    `,
    prisma.studentFeedback.findMany({
      where: { category: "COMPLAINT" },
      select: {
        id: true,
        chatId: true,
        participantId: true,
        messageText: true,
        severity: true,
        status: true,
        createdAt: true,
        participant: { select: { fullName: true } },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 5,
    }),
  ]);

  const routedCounts = answerRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.routed_to ?? "unknown"] = Number(row.count);
    return acc;
  }, {});
  const aiAnswered = routedCounts.ai ?? 0;
  const templateAnswered = (routedCounts.templated ?? 0) + (routedCounts.template ?? 0) + (routedCounts.lms ?? 0);
  const fallbackRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count
    FROM bot_messages
    WHERE role = 'assistant'
      AND created_at >= ${windowStart}
      AND (
        content ILIKE '%AI yordamchim hozir band%'
        OR content ILIKE '%fallback%'
      )
  `;
  const fallbackCount = Number(fallbackRows[0]?.count ?? 0);

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
    usage: {
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      avg_response_time_ms: avgResponseTimeMs,
      tts_count: ttsCount,
      top_expensive_users: topExpensiveUsers,
    },
    answers: {
      ai_answered: aiAnswered,
      template_answered: templateAnswered,
      fallback_count: fallbackCount,
      unanswered_count: Number(unansweredRows[0]?.count ?? 0),
      routed_counts: routedCounts,
    },
    insights: {
      common_intents: intentRows.map((r) => ({
        intent: r.intent,
        count: Number(r.count),
      })),
      low_rated_questions: lowRatedRows.map((r) => ({
        message_id: r.message_id,
        chat_id: r.chat_id.toString(),
        content: r.content,
        stars: r.stars,
        reason: r.reason,
        status: r.status,
        created_at: r.created_at.toISOString(),
      })),
      complaint_questions: complaintRows.map((r) => ({
        id: r.id,
        chat_id: r.chatId.toString(),
        participant_id: r.participantId,
        full_name: r.participant?.fullName ?? null,
        content: r.messageText,
        severity: r.severity,
        status: r.status,
        created_at: r.createdAt.toISOString(),
      })),
    },
    quality: {
      total_ratings: ratings.length,
      avg_stars: avgStars !== null ? Math.round(avgStars * 100) / 100 : null,
      distribution,
    },
    timeline,
  });
}
