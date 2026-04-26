import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

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

type BotUsageByChatRow = {
  chatId: bigint;
  _sum: { tokensIn: number | null; tokensOut: number | null; costUsd: unknown };
  _avg: { responseTimeMs: number | null };
};

const botUsageByChat = prisma.botUsageLog as unknown as {
  groupBy(args: {
    by: ["chatId"];
    where: { chatId: { in: bigint[] } };
    _sum: { tokensIn: true; tokensOut: true; costUsd: true };
    _avg: { responseTimeMs: true };
  }): Promise<BotUsageByChatRow[]>;
};

export async function GET(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "chatbot", "conversations")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Group BotMessages by chatId to get conversation stats
  const grouped = await prisma.botMessage.groupBy({
    by: ["chatId", "participantId"],
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
  });

  // Collect unique participantIds for name lookups
  const participantIds = [...new Set(
    grouped.map((g) => g.participantId).filter((id): id is string => id !== null)
  )];

  const [participants, telegramLinks] = await Promise.all([
    participantIds.length > 0
      ? prisma.participant.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    participantIds.length > 0
      ? prisma.telegramLink.findMany({
          where: { participantId: { in: participantIds } },
          select: { participantId: true, verifiedPhone: true },
        })
      : Promise.resolve([]),
  ]);

  const nameById = new Map(participants.map((p) => [p.id, p.fullName]));
  const phoneById = new Map(telegramLinks.map((tl) => [tl.participantId, tl.verifiedPhone]));

  // Apply search filter (by name or chatId)
  let filtered = grouped;
  if (search) {
    const lower = search.toLowerCase();
    filtered = grouped.filter((g) => {
      const name = g.participantId ? nameById.get(g.participantId) ?? "" : "";
      return (
        name.toLowerCase().includes(lower) ||
        g.chatId.toString().includes(lower)
      );
    });
  }

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);
  const pageChatIds = page.map((g) => g.chatId);

  const [latestMessages, tokenRows, usageRows] = pageChatIds.length > 0
    ? await Promise.all([
        prisma.botMessage.findMany({
          where: { chatId: { in: pageChatIds } },
          orderBy: { createdAt: "desc" },
          select: {
            chatId: true,
            intent: true,
            routedTo: true,
            tokenCount: true,
            rating: { select: { stars: true, status: true } },
          },
        }),
        prisma.botMessage.groupBy({
          by: ["chatId"],
          where: { chatId: { in: pageChatIds } },
          _sum: { tokenCount: true },
        }),
        botUsageByChat.groupBy({
          by: ["chatId"],
          where: { chatId: { in: pageChatIds } },
          _sum: { tokensIn: true, tokensOut: true, costUsd: true },
          _avg: { responseTimeMs: true },
        }),
      ])
    : [[], [], []] as const;

  const latestByChat = new Map<string, (typeof latestMessages)[number]>();
  for (const msg of latestMessages) {
    const key = msg.chatId.toString();
    if (!latestByChat.has(key)) latestByChat.set(key, msg);
  }

  const messageTokensByChat = new Map(
    tokenRows.map((row) => [row.chatId.toString(), row._sum.tokenCount ?? 0])
  );
  const usageByChat = new Map(
    usageRows.map((row) => [row.chatId.toString(), {
      tokensIn: row._sum.tokensIn ?? 0,
      tokensOut: row._sum.tokensOut ?? 0,
      costUsd: toNumber(row._sum.costUsd),
      avgResponseTimeMs: row._avg.responseTimeMs != null
        ? Math.round(row._avg.responseTimeMs)
        : null,
    }])
  );

  const users = page.map((g) => ({
    chat_id: g.chatId.toString(),
    participant_id: g.participantId ?? null,
    full_name: g.participantId ? (nameById.get(g.participantId) ?? null) : null,
    phone: g.participantId ? (phoneById.get(g.participantId) ?? null) : null,
    message_count: g._count.id,
    last_message_at: g._max.createdAt?.toISOString() ?? null,
    intent: latestByChat.get(g.chatId.toString())?.intent ?? null,
    routed_to: latestByChat.get(g.chatId.toString())?.routedTo ?? null,
    token_count: (messageTokensByChat.get(g.chatId.toString()) ?? 0) +
      (usageByChat.get(g.chatId.toString())?.tokensIn ?? 0) +
      (usageByChat.get(g.chatId.toString())?.tokensOut ?? 0),
    usage_cost_usd: usageByChat.get(g.chatId.toString())?.costUsd ?? 0,
    avg_response_time_ms: usageByChat.get(g.chatId.toString())?.avgResponseTimeMs ?? null,
    rating: latestByChat.get(g.chatId.toString())?.rating
      ? {
          stars: latestByChat.get(g.chatId.toString())!.rating!.stars,
          status: latestByChat.get(g.chatId.toString())!.rating!.status,
        }
      : null,
  }));

  return NextResponse.json({ users, total });
}
