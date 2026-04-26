import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["new", "in_review", "resolved"]);
const VALID_CATEGORIES = new Set(["COMPLAINT", "SUGGESTION", "PRAISE"]);

async function requireChatbotAccess() {
  const user = await getFullUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const allowed =
    hasPermission(user, "chatbot", "conversations") ||
    hasPermission(user, "chatbot", "view");

  if (!allowed) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET(request: Request) {
  const auth = await requireChatbotAccess();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "new";
  const category = searchParams.get("category");
  const focus = searchParams.get("focus");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 1), 200);

  if (status !== "all" && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (category && category !== "all" && !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const lowRatedChatIds =
    focus === "attention"
      ? await prisma.botMessageRating.findMany({
          where: { stars: { lte: 2 } },
          select: { message: { select: { chatId: true } } },
          distinct: ["messageId"],
          take: 500,
        })
      : [];

  const lowRatedIds = lowRatedChatIds.map((rating) => rating.message.chatId);

  const items = await prisma.studentFeedback.findMany({
    where: {
      ...(status === "all" ? {} : { status }),
      ...(category && category !== "all" ? { category } : {}),
      ...(focus === "attention"
        ? {
            OR: [
              { category: "COMPLAINT" },
              { severity: { in: ["HIGH", "MEDIUM"] } },
              ...(lowRatedIds.length > 0 ? [{ chatId: { in: lowRatedIds } }] : []),
            ],
          }
        : {}),
    },
    include: {
      participant: { select: { id: true, fullName: true, phone: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  const missingParticipantChatIds = items
    .filter((item) => !item.participant)
    .map((item) => item.chatId);

  const linkedParticipants =
    missingParticipantChatIds.length > 0
      ? await prisma.telegramLink.findMany({
          where: { chatId: { in: missingParticipantChatIds } },
          select: {
            chatId: true,
            participant: { select: { id: true, fullName: true, phone: true } },
          },
        })
      : [];

  const participantByChatId = new Map(
    linkedParticipants.map((link) => [link.chatId.toString(), link.participant])
  );

  return NextResponse.json({
    items: items.map((item) => {
      const participant = item.participant ?? participantByChatId.get(item.chatId.toString()) ?? null;

      return {
        id: item.id,
        created_at: item.createdAt.toISOString(),
        category: item.category,
        severity: item.severity,
        tags: item.tags,
        message_text: item.messageText,
        status: item.status,
        curator_note: item.curatorNote,
        chat_id: item.chatId.toString(),
        participant: participant
          ? {
              id: participant.id,
              full_name: participant.fullName,
              phone: participant.phone,
            }
          : null,
      };
    }),
  });
}
