import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    last_seen: string | null;
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
      last_seen: null,
    });
  }

  // 2. Get per-chatId message counts and last seen from BotMessage
  const msgStats = await prisma.botMessage.groupBy({
    by: ["chatId"],
    _count: { id: true },
    _max: { createdAt: true },
  });

  const msgByChatId = new Map<string, { count: number; lastSeen: string | null }>();
  for (const row of msgStats) {
    msgByChatId.set(row.chatId.toString(), {
      count: row._count.id,
      lastSeen: row._max.createdAt?.toISOString() ?? null,
    });
  }

  // 3. Merge message stats into linked users
  for (const [chatId, rec] of linkedByChatId) {
    const stats = msgByChatId.get(chatId);
    if (stats) {
      rec.message_count = stats.count;
      rec.last_seen = stats.lastSeen;
    }
  }

  // 4. Add anonymous chatIds from BotMessage that have no TelegramLink
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
        message_count: stats.count,
        last_seen: stats.lastSeen,
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

  return NextResponse.json({ users: page, total });
}
