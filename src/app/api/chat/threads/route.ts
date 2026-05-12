import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { previewText, serializeLink } from "../_utils";

export const dynamic = "force-dynamic";

type ThreadStats = {
  chatId: bigint;
  telegramCount: number;
  botCount: number;
  lastActivity: Date | null;
};

type LatestTelegramRow = {
  chatId: bigint;
  text: string | null;
  messageType: string;
  createdAt: Date;
};

type LatestBotRow = {
  chatId: bigint;
  content: string;
  createdAt: Date;
};

function upsertStats(statsByChat: Map<string, ThreadStats>, chatId: bigint) {
  const key = chatId.toString();
  const existing = statsByChat.get(key);
  if (existing) return existing;

  const stats = {
    chatId,
    telegramCount: 0,
    botCount: 0,
    lastActivity: null,
  };
  statsByChat.set(key, stats);
  return stats;
}

function newerDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

export async function GET() {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !hasPermission(user, "participants", "edit") &&
    !hasPermission(user, "chatbot", "conversations")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [telegramGroups, botGroups] = await Promise.all([
    prisma.telegramMessage.groupBy({
      by: ["chatId"],
      _count: { id: true },
      _max: { createdAt: true },
    }),
    prisma.botMessage.groupBy({
      by: ["chatId"],
      _count: { id: true },
      _max: { createdAt: true },
    }),
  ]);

  const statsByChat = new Map<string, ThreadStats>();

  for (const group of telegramGroups) {
    const stats = upsertStats(statsByChat, group.chatId);
    stats.telegramCount = group._count.id;
    stats.lastActivity = newerDate(stats.lastActivity, group._max.createdAt);
  }

  for (const group of botGroups) {
    const stats = upsertStats(statsByChat, group.chatId);
    stats.botCount = group._count.id;
    stats.lastActivity = newerDate(stats.lastActivity, group._max.createdAt);
  }

  const sortedStats = [...statsByChat.values()].sort((a, b) => {
    const left = a.lastActivity?.getTime() ?? 0;
    const right = b.lastActivity?.getTime() ?? 0;
    return right - left;
  });

  const chatIds = sortedStats.map((stats) => stats.chatId);

  const chatIdParams = chatIds.map((chatId) => chatId.toString());

  const [telegramLinks, telegramLatest, botLatest] = chatIds.length > 0
    ? await Promise.all([
        prisma.telegramLink.findMany({
          where: { chatId: { in: chatIds } },
          include: {
            participant: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
                photoUrl: true,
              },
            },
          },
          orderBy: { linkedAt: "desc" },
        }),
        prisma.$queryRawUnsafe<LatestTelegramRow[]>(
          `
            SELECT DISTINCT ON ("chat_id")
              "chat_id" AS "chatId",
              "text",
              "message_type" AS "messageType",
              "created_at" AS "createdAt"
            FROM "telegram_messages"
            WHERE "chat_id" = ANY($1::bigint[])
            ORDER BY "chat_id", "created_at" DESC
          `,
          chatIdParams,
        ),
        prisma.$queryRawUnsafe<LatestBotRow[]>(
          `
            SELECT DISTINCT ON ("chat_id")
              "chat_id" AS "chatId",
              "content",
              "created_at" AS "createdAt"
            FROM "bot_messages"
            WHERE "chat_id" = ANY($1::bigint[])
            ORDER BY "chat_id", "created_at" DESC
          `,
          chatIdParams,
        ),
      ])
    : [[], [], []] as const;

  const linkByChat = new Map<string, (typeof telegramLinks)[number]>();
  for (const link of telegramLinks) {
    const key = link.chatId.toString();
    if (!linkByChat.has(key)) linkByChat.set(key, link);
  }

  const latestTelegramByChat = new Map<string, (typeof telegramLatest)[number]>();
  for (const message of telegramLatest) {
    const key = message.chatId.toString();
    if (!latestTelegramByChat.has(key)) latestTelegramByChat.set(key, message);
  }

  const latestBotByChat = new Map<string, (typeof botLatest)[number]>();
  for (const message of botLatest) {
    const key = message.chatId.toString();
    if (!latestBotByChat.has(key)) latestBotByChat.set(key, message);
  }

  const threads = sortedStats.map((stats) => {
    const key = stats.chatId.toString();
    const latestTelegram = latestTelegramByChat.get(key);
    const latestBot = latestBotByChat.get(key);
    const latest = !latestBot || (
      latestTelegram && latestTelegram.createdAt > latestBot.createdAt
    )
      ? {
          preview: previewText(latestTelegram?.text, latestTelegram?.messageType ?? "Message"),
          createdAt: latestTelegram?.createdAt ?? null,
        }
      : {
          preview: previewText(latestBot.content),
          createdAt: latestBot.createdAt,
        };

    return {
      chat_id: key,
      ...serializeLink(linkByChat.get(key)),
      telegram_count: stats.telegramCount,
      bot_count: stats.botCount,
      total_count: stats.telegramCount + stats.botCount,
      last_message_preview: latest.preview,
      last_activity: (latest.createdAt ?? stats.lastActivity)?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ threads, total: threads.length });
}
