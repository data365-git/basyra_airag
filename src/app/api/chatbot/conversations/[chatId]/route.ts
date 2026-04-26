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

type BotUsageByMessageRow = {
  messageId: string | null;
  _sum: { tokensIn: number | null; tokensOut: number | null; costUsd: unknown };
  _avg: { responseTimeMs: number | null };
};

type JsonRecord = Record<string, unknown>;

type UsageDiagnostics = {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  responseTimeMs: number | null;
};

type TelegramMessageDiagnostics = {
  direction: string;
  text: string | null;
  messageType: string;
  telegramMsgId: number | null;
  createdAt: Date;
};

const botUsageByMessage = prisma.botUsageLog as unknown as {
  groupBy(args: {
    by: ["messageId"];
    where: { chatId: bigint; messageId: { in: string[] } };
    _sum: { tokensIn: true; tokensOut: true; costUsd: true };
    _avg: { responseTimeMs: true };
  }): Promise<BotUsageByMessageRow[]>;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(value: string): JsonRecord | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function nestedRecord(source: JsonRecord, key: string): JsonRecord | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function diagnosticSources(message: JsonRecord, content: string): JsonRecord[] {
  const sources: JsonRecord[] = [];
  const contentRecord = parseJsonRecord(content);
  for (const source of [message, contentRecord].filter(isRecord)) {
    sources.push(source);
    for (const key of ["metadata", "diagnostics", "reply_context", "replyContext"]) {
      const nested = nestedRecord(source, key);
      if (nested) sources.push(nested);
    }
  }
  return sources;
}

function firstValue(sources: JsonRecord[], keys: string[]): unknown {
  for (const source of sources) {
    for (const key of keys) {
      if (source[key] != null) return source[key];
    }
  }
  return null;
}

function toNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = toNumber(value);
  return Number.isFinite(num) ? num : null;
}

function toNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "yes", "1"].includes(value.toLowerCase())) return true;
    if (["false", "no", "0"].includes(value.toLowerCase())) return false;
  }
  if (typeof value === "number") return value !== 0;
  return null;
}

function closestTelegramMessage(
  message: { role: string; content: string; createdAt: Date },
  telegramMessages: TelegramMessageDiagnostics[],
  usedIndexes: Set<number>
): TelegramMessageDiagnostics | null {
  const direction = message.role === "assistant" ? "out" : "in";
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  telegramMessages.forEach((telegramMessage, index) => {
    if (usedIndexes.has(index)) return;
    if (telegramMessage.direction !== direction) return;
    if (telegramMessage.text !== message.content) return;

    const distance = Math.abs(telegramMessage.createdAt.getTime() - message.createdAt.getTime());
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });

  if (bestIndex === -1) return null;
  usedIndexes.add(bestIndex);
  return telegramMessages[bestIndex];
}

function buildDiagnostics(args: {
  message: { role: string; content: string };
  rawMessage: JsonRecord;
  usage: UsageDiagnostics | null;
  telegramMessage: TelegramMessageDiagnostics | null;
}) {
  const sources = diagnosticSources(args.rawMessage, args.message.content);
  const timingMs = toNullableNumber(firstValue(sources, [
    "response_time_ms",
    "responseTimeMs",
    "timing_ms",
    "timingMs",
    "latency_ms",
    "latencyMs",
    "duration_ms",
    "durationMs",
  ]));
  const answerCharCount = toNullableNumber(firstValue(sources, [
    "answer_char_count",
    "answerCharCount",
    "char_count",
    "charCount",
    "answer_length",
    "answerLength",
  ]));

  return {
    reply_context_used: toNullableBoolean(firstValue(sources, [
      "reply_context_used",
      "replyContextUsed",
      "used_reply_context",
      "usedReplyContext",
      "context_used",
      "contextUsed",
    ])),
    reply_to_message_id: toNullableString(firstValue(sources, [
      "reply_to_message_id",
      "replyToMessageId",
      "in_reply_to_message_id",
      "inReplyToMessageId",
      "reply_to",
      "replyTo",
    ])),
    telegram_message_id: toNullableNumber(firstValue(sources, [
      "telegram_message_id",
      "telegramMessageId",
      "telegram_msg_id",
      "telegramMsgId",
    ])) ?? args.telegramMessage?.telegramMsgId ?? null,
    delivery_type: toNullableString(firstValue(sources, [
      "delivery_type",
      "deliveryType",
      "delivery",
      "message_type",
      "messageType",
    ])) ?? args.telegramMessage?.messageType ?? null,
    finish_reason: toNullableString(firstValue(sources, [
      "finish_reason",
      "finishReason",
      "stop_reason",
      "stopReason",
    ])),
    continuation_count: toNullableNumber(firstValue(sources, [
      "continuation_count",
      "continuationCount",
      "continuations",
      "continuation_chunks",
      "continuationChunks",
    ])),
    answer_char_count: answerCharCount ?? (
      args.message.role === "assistant" ? args.message.content.length : null
    ),
    timing_ms: timingMs ?? args.usage?.responseTimeMs ?? null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "chatbot", "conversations")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { chatId: chatIdStr } = await params;
  let chatIdBig: bigint;
  try {
    chatIdBig = BigInt(chatIdStr);
  } catch {
    return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
  }

  const messages = await prisma.botMessage.findMany({
    where: { chatId: chatIdBig },
    include: { rating: { select: { stars: true, reason: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });

  const [usageRows, telegramMessages] = await Promise.all([
    botUsageByMessage.groupBy({
      by: ["messageId"],
      where: {
        chatId: chatIdBig,
        messageId: { in: messages.map((m) => m.id) },
      },
      _sum: { tokensIn: true, tokensOut: true, costUsd: true },
      _avg: { responseTimeMs: true },
    }),
    prisma.telegramMessage.findMany({
      where: { chatId: chatIdBig },
      orderBy: { createdAt: "asc" },
      select: {
        direction: true,
        text: true,
        messageType: true,
        telegramMsgId: true,
        createdAt: true,
      },
    }),
  ]);

  const usageByMessage = new Map(
    usageRows
      .filter((row) => row.messageId)
      .map((row) => [row.messageId!, {
        tokensIn: row._sum.tokensIn ?? 0,
        tokensOut: row._sum.tokensOut ?? 0,
        costUsd: toNumber(row._sum.costUsd),
        responseTimeMs: row._avg.responseTimeMs != null
          ? Math.round(row._avg.responseTimeMs)
          : null,
      }])
  );

  // Derive participantId from messages (first non-null wins)
  const participantId = messages.find((m) => m.participantId)?.participantId ?? null;

  const participant = participantId
    ? await prisma.participant.findUnique({
        where: { id: participantId },
        select: { id: true, fullName: true },
      })
    : null;

  const usedTelegramIndexes = new Set<number>();

  return NextResponse.json({
    messages: messages.map((m) => {
      const usage = usageByMessage.get(m.id) ?? null;
      const telegramMessage = closestTelegramMessage(m, telegramMessages, usedTelegramIndexes);

      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        created_at: m.createdAt.toISOString(),
        intent: m.intent,
        routed_to: m.routedTo,
        token_count: m.tokenCount ?? null,
        usage: usage
          ? {
              tokens_in: usage.tokensIn,
              tokens_out: usage.tokensOut,
              cost_usd: usage.costUsd,
              response_time_ms: usage.responseTimeMs,
            }
          : null,
        diagnostics: buildDiagnostics({
          message: m,
          rawMessage: m as unknown as JsonRecord,
          usage,
          telegramMessage,
        }),
        rating: m.rating
          ? { stars: m.rating.stars, reason: m.rating.reason, status: m.rating.status }
          : null,
      };
    }),
    participant: participant
      ? { id: participant.id, full_name: participant.fullName }
      : null,
  });
}
