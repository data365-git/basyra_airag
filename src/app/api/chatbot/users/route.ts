import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasAnyPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const LEGACY_HEADERS = {
  Deprecation: "true",
  Link: '</api/chat/threads>; rel="successor-version"',
};

export async function GET(request: Request) {
  const user = await getFullUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: LEGACY_HEADERS });
  }
  if (!hasAnyPermission(user, [
    ["chatbot", "conversations"],
    ["chatbot", "broadcast"],
  ])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: LEGACY_HEADERS });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // 1. All TelegramLink rows with participant info
  const telegramLinks = await prisma.telegramLink.findMany({
    include: {
      participant: {
        select: { id: true, fullName: true, phone: true, isBlocked: true },
      },
    },
  });

  // Map chatId -> linked user info
  type UserRecord = {
    chat_id: string;
    participant_id: string | null;
    full_name: string | null;
    phone: string | null;
    is_linked: boolean;
    is_active: boolean;
    message_count: number;
    telegram_count: number;
    bot_count: number;
    total_count: number;
    last_seen: string | null;
    last_activity: string | null;
  };

  const linkedByChatId = new Map<string, UserRecord>();

  for (const tl of telegramLinks) {
    const chatStr = tl.chatId.toString();
    linkedByChatId.set(chatStr, {
      chat_id: chatStr,
      participant_id: tl.participantId,
      full_name: tl.participant.fullName,
      phone: tl.participant.phone ?? tl.verifiedPhone ?? null,
      is_linked: true,
      is_active: !tl.participant.isBlocked,
      message_count: 0,
      telegram_count: 0,
      bot_count: 0,
      total_count: 0,
      last_seen: null,
      last_activity: null,
    });
  }

  // 2. Get per-chatId message counts and last seen from both legacy and unified sources.
  const [telegramStats, botStats] = await Promise.all([
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

  const msgByChatId = new Map<string, {
    telegramCount: number;
    botCount: number;
    totalCount: number;
    lastSeen: string | null;
  }>();
  const upsertStats = (chatId: bigint) => {
    const key = chatId.toString();
    const existing = msgByChatId.get(key);
    if (existing) return existing;
    const created = { telegramCount: 0, botCount: 0, totalCount: 0, lastSeen: null };
    msgByChatId.set(key, created);
    return created;
  };

  for (const row of telegramStats) {
    const stats = upsertStats(row.chatId);
    stats.telegramCount = row._count.id;
    stats.totalCount = stats.telegramCount + stats.botCount;
    const lastSeen = row._max.createdAt?.toISOString() ?? null;
    if (lastSeen && (!stats.lastSeen || lastSeen > stats.lastSeen)) stats.lastSeen = lastSeen;
  }

  for (const row of botStats) {
    const stats = upsertStats(row.chatId);
    stats.botCount = row._count.id;
    stats.totalCount = stats.telegramCount + stats.botCount;
    const lastSeen = row._max.createdAt?.toISOString() ?? null;
    if (lastSeen && (!stats.lastSeen || lastSeen > stats.lastSeen)) stats.lastSeen = lastSeen;
  }

  // 3. Merge message stats into linked users
  for (const [chatId, rec] of linkedByChatId) {
    const stats = msgByChatId.get(chatId);
    if (stats) {
      rec.telegram_count = stats.telegramCount;
      rec.bot_count = stats.botCount;
      rec.total_count = stats.totalCount;
      rec.message_count = stats.totalCount;
      rec.last_seen = stats.lastSeen;
      rec.last_activity = stats.lastSeen;
    }
  }

  // 4. Add anonymous chatIds from messages that have no TelegramLink
  const linkedChatIds = new Set(linkedByChatId.keys());
  for (const [chatId, stats] of msgByChatId) {
    if (!linkedChatIds.has(chatId)) {
      linkedByChatId.set(chatId, {
        chat_id: chatId,
        participant_id: null,
        full_name: null,
        phone: null,
        is_linked: false,
        is_active: true,
        message_count: stats.totalCount,
        telegram_count: stats.telegramCount,
        bot_count: stats.botCount,
        total_count: stats.totalCount,
        last_seen: stats.lastSeen,
        last_activity: stats.lastSeen,
      });
    }
  }

  let all = Array.from(linkedByChatId.values());

  // Sort: linked first, then by last_seen desc
  all.sort((a, b) => {
    if (a.is_linked !== b.is_linked) return a.is_linked ? -1 : 1;
    const ta = a.last_seen ?? "";
    const tb = b.last_seen ?? "";
    return tb.localeCompare(ta);
  });

  // 5. Search filter
  if (search) {
    const lower = search.toLowerCase();
    all = all.filter(
      (u) =>
        (u.full_name ?? "").toLowerCase().includes(lower) ||
        (u.phone ?? "").includes(lower) ||
        u.chat_id.includes(lower)
    );
  }

  const total = all.length;
  const page = all.slice(offset, offset + limit);
  const threads = page.map((u) => ({
    chat_id: u.chat_id,
    linked: u.is_linked,
    label: u.full_name ?? `Chat ${u.chat_id}`,
    telegram_link: null,
    participant: u.participant_id
      ? {
          id: u.participant_id,
          full_name: u.full_name,
          phone: u.phone,
          email: null,
          photo_url: null,
        }
      : null,
    telegram_count: u.telegram_count,
    bot_count: u.bot_count,
    total_count: u.total_count,
    last_message_preview: null,
    last_activity: u.last_activity,
  }));

  return NextResponse.json({ users: page, threads, total }, { headers: LEGACY_HEADERS });
}
