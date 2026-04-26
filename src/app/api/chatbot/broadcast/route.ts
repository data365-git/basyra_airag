import { Bot } from "grammy";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type BroadcastSegment = "all" | "active" | "inactive" | "training" | "homework_pending";

type BroadcastBody = {
  message: string;
  type?: string;
  segment?: BroadcastSegment;
  trainingId?: string;
};

function parseSegment(value: unknown): BroadcastSegment {
  if (
    value === "active" ||
    value === "inactive" ||
    value === "training" ||
    value === "homework_pending"
  ) {
    return value;
  }
  return "all";
}

async function requireBroadcastUser() {
  const user = await getFullUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!hasPermission(user, "chatbot", "broadcast")) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

async function getPendingHomeworkParticipantIds(trainingId?: string) {
  const homeworks = await prisma.homework.findMany({
    where: trainingId ? { trainingId } : undefined,
    select: {
      submissions: { select: { participantId: true } },
      training: {
        select: {
          trainingParticipants: { select: { participantId: true } },
        },
      },
    },
  });

  const pending = new Set<string>();

  for (const homework of homeworks) {
    const submitted = new Set(homework.submissions.map((s) => s.participantId));
    for (const participant of homework.training.trainingParticipants) {
      if (!submitted.has(participant.participantId)) {
        pending.add(participant.participantId);
      }
    }
  }

  return [...pending];
}

async function getRecipientLinks(segment: BroadcastSegment, trainingId?: string) {
  if (segment === "training" && !trainingId) {
    throw new Error("Training required");
  }

  if (segment === "homework_pending") {
    const participantIds = await getPendingHomeworkParticipantIds(trainingId);
    if (participantIds.length === 0) return [];

    return prisma.telegramLink.findMany({
      where: {
        participantId: { in: participantIds },
        participant: { isBlocked: false },
      },
      select: { chatId: true, participantId: true },
    });
  }

  return prisma.telegramLink.findMany({
    where: {
      ...(segment === "active" ? { participant: { isBlocked: false } } : {}),
      ...(segment === "inactive" ? { participant: { isBlocked: true } } : {}),
      ...(segment === "training"
        ? {
            participant: {
              isBlocked: false,
              trainingParticipants: { some: { trainingId } },
            },
          }
        : {}),
    },
    select: { chatId: true, participantId: true },
  });
}

function normalizeBroadcastType(value: string | undefined) {
  return value?.trim() || "other";
}

async function getBroadcastHistory() {
  return prisma.chatbotBroadcastHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      message: true,
      type: true,
      segment: true,
      trainingId: true,
      total: true,
      sent: true,
      failed: true,
      errorSummary: true,
      createdById: true,
      createdAt: true,
    },
  });
}

async function getBroadcastPreview(segment: BroadcastSegment, trainingId?: string) {
  const [links, trainings, history] = await Promise.all([
    getRecipientLinks(segment, trainingId),
    prisma.training.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true },
    }),
    getBroadcastHistory(),
  ]);

  return {
    segment,
    trainingId: trainingId ?? null,
    total: links.length,
    trainings,
    history,
  };
}

async function createBroadcastHistory(
  userId: string,
  entry: {
    message: string;
    type?: string;
    segment: BroadcastSegment;
    trainingId?: string;
    total: number;
    sent: number;
    failed: number;
    errorSummary: Record<string, number>;
  }
) {
  try {
    return await prisma.chatbotBroadcastHistory.create({
      data: {
        message: entry.message,
        type: normalizeBroadcastType(entry.type),
        segment: entry.segment,
        trainingId: entry.trainingId,
        total: entry.total,
        sent: entry.sent,
        failed: entry.failed,
        errorSummary: entry.errorSummary,
        createdById: userId,
      },
      select: {
        id: true,
        message: true,
        type: true,
        segment: true,
        trainingId: true,
        total: true,
        sent: true,
        failed: true,
        errorSummary: true,
        createdById: true,
        createdAt: true,
      },
    });
  } catch {
    // Broadcast delivery should not fail just because history storage failed.
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireBroadcastUser();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const segment = parseSegment(searchParams.get("segment"));
  const trainingId = searchParams.get("trainingId") || undefined;

  try {
    return NextResponse.json(await getBroadcastPreview(segment, trainingId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireBroadcastUser();
  if ("response" in auth) return auth.response;

  const body = await req.json();
  const { message, type, trainingId } = body as BroadcastBody;
  const segment = parseSegment((body as BroadcastBody).segment);

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  let links: Awaited<ReturnType<typeof getRecipientLinks>>;
  try {
    links = await getRecipientLinks(segment, trainingId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid segment" },
      { status: 400 }
    );
  }

  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token) return NextResponse.json({ error: "Bot token not configured" }, { status: 500 });

  const bot = new Bot(token);
  let sent = 0;
  let failed = 0;
  let pending = links.length;
  const errors: Record<string, number> = {};

  for (const link of links) {
    try {
      await bot.api.sendMessage(Number(link.chatId), message, { parse_mode: "HTML" });
      sent++;
    } catch (error) {
      failed++;
      const key =
        error instanceof Error
          ? error.message.slice(0, 160)
          : "Unknown Telegram error";
      errors[key] = (errors[key] ?? 0) + 1;
    } finally {
      pending--;
    }
    // Sequential sends with a modest delay keep us below Telegram burst limits.
    await new Promise((r) => setTimeout(r, 75));
  }

  const historyEntry = await createBroadcastHistory(auth.user.id, {
    message,
    type,
    segment,
    trainingId,
    total: links.length,
    sent,
    failed,
    errorSummary: errors,
  });

  return NextResponse.json({ sent, failed, pending, total: links.length, errors, historyEntry });
}
