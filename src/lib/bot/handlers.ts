/**
 * Command and message handlers (non-auth).
 *
 * Covers:
 *  - /mystatus
 *  - /debug
 *  - /cancel
 *  - /homework
 *  - Callback: hw_select, hw_done, hw_file_confirm, hw_file_reject, callback_query logging
 *  - Text messages (plain text submission + unrecognised fallback)
 *  - File messages (document, audio, video, voice, photo)
 */

import { Bot, InlineKeyboard, InputFile } from "grammy";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getParticipantScorecard } from "@/lib/scorecard";
import { uploadTelegramFileToR2 } from "@/lib/r2Upload";
import { logSubmissionEvent, SubmissionEventType } from "@/lib/submissionEvents";
import { requireParticipant } from "@/lib/botAuth";
import { linkedKeyboard, logMessage, reply } from "./ui";
import { pendingSubmissions, pendingFiles, pendingRatingComment } from "./state";
import { classifyMessage, extractFeedbackMeta } from "@/lib/intentRouter";
import { askRag, logBotMessage, logUsage } from "@/lib/aiClient";

const UZ_MONTHS = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
const DEFAULT_TTS_CHUNK_CHARS = 400;
const DEFAULT_TTS_FIRST_CHUNK_CHARS = 350;
const DEFAULT_TTS_CONCURRENCY = 2;
const TELEGRAM_TEXT_LIMIT = 3900;
const MEDIUM_ANSWER_SPLIT_LIMIT = 9000;

type LongAnswerDelegate = {
  create(args: {
    data: {
      messageId?: string;
      participantId?: string;
      title: string;
      summary: string;
      bodyMd: string;
    };
  }): Promise<{ id: string }>;
};

type BotTtsChunkDelegate = {
  findMany(args: {
    where: { messageId: string };
    orderBy: { idx: "asc" | "desc" };
  }): Promise<Array<{ idx: number; fileId: string }>>;
  create(args: {
    data: { messageId: string; idx: number; fileId: string };
  }): Promise<unknown>;
};

const prismaBotModels = prisma as typeof prisma & {
  longAnswer: LongAnswerDelegate;
  botTtsChunk: BotTtsChunkDelegate;
};

/** Repair unbalanced Markdown delimiters that cause Telegram to silently drop formatting */
function sanitizeMarkdown(text: string): string {
  let result = text;
  for (const delim of ["*", "_", "`"]) {
    const matches = result.match(new RegExp(`\\${delim}`, "g")) ?? [];
    if (matches.length % 2 === 1) {
      result = result.replace(new RegExp(`\\${delim}`, "g"), `\\${delim}`);
    }
  }
  return result;
}

function fmtUzDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return `${dt.getDate()} ${UZ_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** Extract first sentence as title (max 80 chars) */
function extractTitle(text: string): string {
  const first = text.split(/[.!?]\s/)[0] ?? text;
  return first.slice(0, 80).trim();
}

/** Extract first 3 sentences as summary */
function extractSummary(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  return sentences.slice(0, 3).join(" ").trim() || text.slice(0, 400).trim();
}

function makeLongAnswerPreview(summary: string): string {
  const cleanSummary = summary.replace(/\s+/g, " ").trim();
  const preview = cleanSummary.length > 650 ? `${cleanSummary.slice(0, 650).trim()}...` : cleanSummary;
  return [
    "💡 Javob biroz uzunroq chiqdi, shuning uchun uni o'qishga qulay maqola qilib tayyorladim.",
    "",
    preview,
    "",
    "Davomini havolada to'liq o'qishingiz mumkin.",
  ].join("\n");
}

type ReplyContext = {
  assistantMessageId: string;
  assistantAnswer: string;
  originalUserQuestion?: string | null;
  articleSummary?: string | null;
  articleBody?: string | null;
};

type ConversationMemory = {
  shortTerm: Array<{ role: string; content: string }>;
};

function compactForReplyContext(value: string | null | undefined, maxChars: number): string {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > maxChars ? `${clean.slice(0, maxChars).trim()}...` : clean;
}

function buildConversationAwareQuestion(
  text: string,
  context: ReplyContext | null,
  memory: ConversationMemory
): string {
  const parts: string[] = [];

  if (memory.shortTerm.length > 0) {
    parts.push(
      [
        "Short-term conversation memory:",
        ...memory.shortTerm.map((message) =>
          `${message.role === "assistant" ? "Assistant" : "User"}: ${compactForReplyContext(message.content, 700)}`
        ),
        "",
        "Use this memory only when clearly relevant. Do not invent missing context.",
      ].join("\n")
    );
  }

  if (context) {
    const replyParts = [
      "User is replying to a previous assistant answer.",
      `Original user question: ${compactForReplyContext(context.originalUserQuestion, 1200) || "(not found)"}`,
      `Assistant answer being replied to: ${compactForReplyContext(context.assistantAnswer, 1800) || "(not found)"}`,
    ];

    const articleBody = compactForReplyContext(context.articleBody, 2500);
    const articleSummary = compactForReplyContext(context.articleSummary, 1000);
    if (articleBody || articleSummary) {
      replyParts.push(`Long-answer article: ${articleBody || articleSummary}`);
    }

    parts.push(replyParts.join("\n\n"));
  }

  parts.push(`New user message: ${text}`);
  return parts.join("\n\n---\n\n");
}

async function loadConversationMemory(chatId: bigint, currentMessageId: string | null): Promise<ConversationMemory> {
  try {
    const messages = await prisma.botMessage.findMany({
      where: {
        chatId,
        ...(currentMessageId ? { id: { not: currentMessageId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 14,
      select: { role: true, content: true },
    });

    return {
      shortTerm: messages
        .reverse()
        .map((message) => ({
          role: message.role,
          content: compactForReplyContext(message.content, 900),
        }))
        .filter((message) => message.content.length > 0),
    };
  } catch (error) {
    console.warn("[BOT] short-term memory lookup failed; continuing without it", error);
    return { shortTerm: [] };
  }
}

async function findOriginalQuestionForAssistant(chatId: bigint, assistant: {
  id: string;
  createdAt: Date;
  replyToMessage?: { content: string } | null;
}): Promise<string | null> {
  if (assistant.replyToMessage?.content) return assistant.replyToMessage.content;

  try {
    const previousUserMessage = await prisma.botMessage.findFirst({
      where: {
        chatId,
        role: "user",
        createdAt: { lt: assistant.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    return previousUserMessage?.content ?? null;
  } catch {
    return null;
  }
}

async function resolveReplyContext(chatId: bigint, replyToTelegramMsgId?: number): Promise<ReplyContext | null> {
  if (!replyToTelegramMsgId) return null;

  try {
    const assistant = await prisma.botMessage.findFirst({
      where: {
        chatId,
        telegramMsgId: replyToTelegramMsgId,
        role: "assistant",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        createdAt: true,
        replyToMessage: { select: { content: true } },
        longAnswer: { select: { summary: true, bodyMd: true } },
      },
    }) as {
      id: string;
      content: string;
      createdAt: Date;
      replyToMessage?: { content: string } | null;
      longAnswer?: { summary: string | null; bodyMd: string | null } | null;
    } | null;

    if (!assistant) return null;

    return {
      assistantMessageId: assistant.id,
      assistantAnswer: assistant.content,
      originalUserQuestion: await findOriginalQuestionForAssistant(chatId, assistant),
      articleSummary: assistant.longAnswer?.summary ?? null,
      articleBody: assistant.longAnswer?.bodyMd ?? null,
    };
  } catch (error) {
    console.warn("[BOT] reply context lookup failed; continuing without it", error);
    return null;
  }
}

async function setBotMessageTelegramMsgId(messageId: string | null, telegramMsgId: number | null): Promise<void> {
  if (!messageId || !telegramMsgId) return;

  try {
    await prisma.botMessage.update({
      where: { id: messageId },
      data: { telegramMsgId },
    });
  } catch (error) {
    console.warn("[BOT] bot message Telegram id update failed; continuing", error);
  }
}

async function mergeBotMessageMetadata(
  messageId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  if (!messageId) return;

  try {
    const current = await prisma.botMessage.findUnique({
      where: { id: messageId },
      select: { metadata: true },
    });
    const existing =
      current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown>
        : {};

    const nextMetadata = { ...existing, ...metadata } as Prisma.InputJsonObject;
    await prisma.botMessage.update({
      where: { id: messageId },
      data: { metadata: nextMetadata },
    });
  } catch (error) {
    console.warn("[BOT] bot message metadata update failed; continuing", error);
  }
}

type DeliveryType = "direct" | "split" | "article";

function chooseDeliveryType(answer: string, articleThreshold: number): DeliveryType {
  if (answer.length <= TELEGRAM_TEXT_LIMIT) return "direct";
  if (answer.length <= Math.max(articleThreshold, MEDIUM_ANSWER_SPLIT_LIMIT)) return "split";
  return "article";
}

function splitTelegramText(text: string, maxChars = 3600): string[] {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (paragraph.length > maxChars) {
      pushCurrent();
      const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [paragraph];
      for (const sentence of sentences) {
        if (sentence.length > maxChars) {
          pushCurrent();
          for (let i = 0; i < sentence.length; i += maxChars) {
            chunks.push(sentence.slice(i, i + maxChars).trim());
          }
        } else if (current && current.length + sentence.length + 1 > maxChars) {
          pushCurrent();
          current = sentence.trim();
        } else {
          current = current ? `${current} ${sentence.trim()}` : sentence.trim();
        }
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars) {
      pushCurrent();
      current = paragraph;
    } else {
      current = next;
    }
  }

  pushCurrent();
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

function parseBoundedInt(raw: string | null | undefined, fallback: number, min: number, max: number): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function resolveTtsConfig(): Promise<{ chunkChars: number; firstChunkChars: number; concurrency: number }> {
  try {
    const keys = [
      "bot.tts.chunk_size_chars",
      "bot.tts.first_chunk_size_chars",
      "bot.tts.concurrency",
      // Backwards-compatible aliases used by early internal builds.
      "tts_chunk_chars",
      "tts_first_chunk_chars",
      "tts_concurrency",
    ];
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    const chunkChars = parseBoundedInt(
      byKey.get("bot.tts.chunk_size_chars") ?? byKey.get("tts_chunk_chars"),
      DEFAULT_TTS_CHUNK_CHARS,
      200,
      1000,
    );
    return {
      chunkChars,
      firstChunkChars: parseBoundedInt(
        byKey.get("bot.tts.first_chunk_size_chars") ?? byKey.get("tts_first_chunk_chars"),
        Math.min(DEFAULT_TTS_FIRST_CHUNK_CHARS, chunkChars),
        120,
        chunkChars,
      ),
      concurrency: parseBoundedInt(
        byKey.get("bot.tts.concurrency") ?? byKey.get("tts_concurrency"),
        DEFAULT_TTS_CONCURRENCY,
        1,
        5,
      ),
    };
  } catch (error) {
    console.warn("[TTS] config lookup failed; using defaults", error);
    return {
      chunkChars: DEFAULT_TTS_CHUNK_CHARS,
      firstChunkChars: DEFAULT_TTS_FIRST_CHUNK_CHARS,
      concurrency: DEFAULT_TTS_CONCURRENCY,
    };
  }
}

async function resolveLongAnswerLimit(): Promise<number> {
  try {
    const row = await prisma.systemSetting.findFirst({
      where: {
        key: {
          in: [
            "bot.long_answer.threshold_chars",
            // Backwards-compatible key from an early settings UI draft.
            "bot.tts.long_answer_threshold_chars",
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return parseBoundedInt(row?.value, 3900, 800, 3900);
  } catch (error) {
    console.warn("[Bot] long-answer config lookup failed; using default", error);
      return 3900;
  }
}

/** Split text into sentence-aligned chunks for parallel TTS */
function splitIntoChunks(text: string, maxChars = DEFAULT_TTS_CHUNK_CHARS, firstMaxChars = maxChars): string[] {
  const pushLongSegment = (segment: string, limit: number, chunks: string[]) => {
    let current = "";
    const words = segment.match(/\S+\s*/g) ?? [segment];
    for (const word of words) {
      if (word.length > limit) {
        if (current.trim()) {
          chunks.push(current.trim());
          current = "";
        }
        for (let i = 0; i < word.length; i += limit) {
          chunks.push(word.slice(i, i + limit).trim());
        }
        continue;
      }
      if (current && current.length + word.length > limit) {
        chunks.push(current.trim());
        current = word;
      } else {
        current += word;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  };

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [];
  const result: string[] = [];
  let current = "";
  for (const s of sentences) {
    const limit = result.length === 0 ? firstMaxChars : maxChars;
    if (s.length > limit) {
      if (current.trim()) {
        result.push(current.trim());
        current = "";
      }
      pushLongSegment(s, limit, result);
    } else if (current && current.length + s.length + 1 > limit) {
      result.push(current.trim());
      current = s;
    } else {
      current = current ? current + " " + s : s;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result.length ? result : [text.slice(0, firstMaxChars)];
}

function buildHomeMenu() {
  return new InlineKeyboard()
    .text("📊 Mening progressim", "menu_status").row()
    .text("📝 Uy vazifam",        "menu_homework").row()
    .text("💡 Savol berish",      "menu_ai");
}

function reasonKeyboard(msgId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("❌ Noto'g'ri javob",   `reason_wrong_${msgId}`)
    .text("🤔 Tushunarsiz",       `reason_unclear_${msgId}`).row()
    .text("⏳ Sekin",              `reason_slow_${msgId}`)
    .text("🎯 Mavzudan tashqari", `reason_offtopic_${msgId}`).row()
    .text("📏 Juda qisqa",        `reason_tooshort_${msgId}`)
    .text("📜 Juda uzun",         `reason_toolong_${msgId}`).row()
    .text("✏️ Boshqa (yozish)",   `reason_other_${msgId}`);
}

export function registerCommandHandlers(b: Bot) {

  // ── /debug — diagnostic: confirms link, env, and that callbacks reach the bot ─
  b.command("debug", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    try {
      const chatId = ctx.chat ? BigInt(ctx.chat.id) : null;
      const link   = chatId ? await prisma.telegramLink.findFirst({ where: { chatId } }) : null;
      const info = {
        chatId:        ctx.chat?.id ?? null,
        userId:        ctx.from?.id ?? null,
        username:      ctx.from?.username ?? null,
        linked:        !!link,
        participantId: link?.participantId ?? null,
        appUrl:        process.env.NEXT_PUBLIC_APP_URL ?? null,
      };
      await ctx.reply(`<pre>${JSON.stringify(info, null, 2).replace(/[<>&]/g, (c) =>
        c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;")}</pre>`, { parse_mode: "HTML" });
    } catch (err) {
      console.error("[BOT] /debug error:", err);
      await ctx.reply("❌ debug error: " + (err as Error).message);
    }
  });

  // ── /menu ─────────────────────────────────────────────────────────────────
  b.command("menu", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    await reply(ctx, "Asosiy menyu:", { reply_markup: buildHomeMenu() });
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  b.command("help", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    await reply(ctx, [
      "📚 <b>Yordam</b>",
      "",
      "📊 Progressim — baholar va davomat",
      "📝 Vazifalarim — uy vazifalari",
      "💡 Savol berish — kurs bo'yicha savol",
      "",
      "/cancel — jarayonni bekor qilish",
      "/menu — asosiy menyuni ochish",
    ].join("\n"));
  });

  // ── Deprecated migration: /mystatus ───────────────────────────────────────
  b.command("mystatus", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const kb = new InlineKeyboard().text("📊 Progressimni ko'rish", "menu_status");
    await reply(ctx, "📊 Progressingizni ko'rish uchun tugmani bosing:", { reply_markup: kb });
  });

  // ── Deprecated migration: /homework ───────────────────────────────────────
  b.command("homework", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const kb = new InlineKeyboard().text("📝 Vazifalarimni ko'rish", "menu_homework");
    await reply(ctx, "📝 Vazifalaringizni ko'rish uchun tugmani bosing:", { reply_markup: kb });
  });

  // ── Catch-all callback_query log — proves callbacks are arriving at all ─────
  // Registered BEFORE the typed handlers so it logs every incoming callback even
  // when the typed handler later answers and short-circuits.
  b.on("callback_query:data", async (ctx, next) => {
    console.log("[BOT] callback_query received:",
      JSON.stringify({ data: ctx.callbackQuery.data, chatId: ctx.chat?.id, userId: ctx.from?.id }));
    await next();
  });

  // ── /cancel ───────────────────────────────────────────────────────────────
  b.command("cancel", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const chatKey = String(ctx.chat!.id);
    const hadPending = pendingSubmissions.has(chatKey) || pendingFiles.has(chatKey) || pendingRatingComment.has(chatKey);
    pendingSubmissions.delete(chatKey);
    pendingFiles.delete(chatKey);
    pendingRatingComment.delete(chatKey);
    if (hadPending) {
      await reply(ctx, "❌ Topshiriq jarayoni bekor qilindi.");
    } else {
      await reply(ctx, "Hozirda faol jarayon yo'q.");
    }
  });

  // ── Callback: homework selected from inline keyboard ──────────────────────
  b.callbackQuery(/^hw_select:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const hwId    = ctx.match[1];
      const chatKey = String(ctx.chat!.id);

      const link = await requireParticipant(ctx);
      if (!link) return;

      const [hw, existingSub] = await Promise.all([
        prisma.homework.findUnique({ where: { id: hwId } }),
        prisma.homeworkSubmission.findUnique({
          where:   { homeworkId_participantId: { homeworkId: hwId, participantId: link.participantId } },
          include: { grade: true, files: { select: { id: true } } },
        }),
      ]);

      if (!hw) { await reply(ctx, "Vazifa topilmadi."); return; }

      // If already graded, inform and exit
      if (existingSub?.grade) {
        await reply(ctx,
          `✅ <b>${hw.title}</b>\n\n` +
          `Bu vazifa allaqachon baholangan: <b>${existingSub.grade.score}/${hw.maxScore}</b>.\n\n` +
          (existingSub.grade.feedback ? `💬 ${existingSub.grade.feedback}\n\n` : "") +
          "Boshqa vazifani tanlash uchun /homework."
        );
        return;
      }

      // Late-submission guards
      const todayStr  = new Date().toISOString().slice(0, 10);
      const isOverdue = !!(hw.dueDate && hw.dueDate < todayStr);
      const lateByDays = isOverdue && hw.dueDate ? Math.round(
        (new Date(todayStr + "T00:00:00Z").getTime() - new Date(hw.dueDate + "T00:00:00Z").getTime()) / 86400000
      ) : 0;

      if (isOverdue && !hw.allowLateSubmission) {
        await reply(ctx, `⏰ <b>${hw.title}</b>\n\nBu vazifa muddati tugagan va kech topshirish ruxsat etilmaydi.`);
        return;
      }
      if (isOverdue && hw.hardCloseAt && hw.hardCloseAt < todayStr) {
        await reply(ctx, `⏰ <b>${hw.title}</b>\n\nBu vazifaning qabul qilish muddati ham o'tdi (${fmtUzDate(hw.hardCloseAt)}).`);
        return;
      }

      // Create or reuse submission (set isLate flag)
      const isNewSub = !existingSub;
      const sub = await prisma.homeworkSubmission.upsert({
        where:  { homeworkId_participantId: { homeworkId: hwId, participantId: link.participantId } },
        update: isOverdue ? { isLate: true, lateByDays } : {},
        create: { homeworkId: hwId, participantId: link.participantId, isLate: isOverdue, lateByDays: isOverdue ? lateByDays : null },
      });

      if (isNewSub) {
        void logSubmissionEvent(prisma, {
          submissionId: sub.id,
          actorId:      link.participantId,
          actorRole:    "participant",
          actorName:    link.participant?.fullName ?? "Noma'lum",
          eventType:    isOverdue ? SubmissionEventType.SUBMITTED_LATE : SubmissionEventType.SUBMITTED,
          meta:         isOverdue ? { lateByDays } : undefined,
        });
      }

      pendingSubmissions.set(chatKey, { homeworkId: hwId, submissionId: sub.id });

      const fileCount = existingSub?.files.length ?? 0;
      const doneKb    = new InlineKeyboard().text("✅ Yakunlash", "hw_done");

      let prompt = `📎 <b>${hw.title}</b>`;
      if (isOverdue) prompt += `\n\n⏰ <i>Bu vazifa muddati ${lateByDays} kun oldin o'tdi — kechikkan holda topshiriladi.</i>`;
      prompt += "\n\n";
      if (existingSub && fileCount > 0) {
        prompt += `Allaqachon ${fileCount} ta fayl yuborilgan.\n\n`;
        prompt += `Qo'shimcha fayl yuborishingiz yoki ✅ Yakunlash tugmasini bosing.`;
      } else {
        prompt += `Fayl yuboring (hujjat, audio, video, rasm) yoki matn yozing.\n\n` +
                  `Tugatgach ✅ <b>Yakunlash</b> tugmasini bosing.\n` +
                  `Bekor qilish: /cancel`;
      }

      await reply(ctx, prompt, { reply_markup: doneKb });
    } catch (err) {
      console.error("[BOT] hw_select callback error:", err);
      await reply(ctx, "⚠️ Xato yuz berdi. Qayta urinib ko'ring.");
    }
  });

  // ── Callback: done button ──────────────────────────────────────────────────
  b.callbackQuery("hw_done", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatKey = String(ctx.chat!.id);
    const pending = pendingSubmissions.get(chatKey);

    if (!pending || !pending.submissionId) {
      await reply(ctx, "Hozirda faol topshiriq yo'q. /homework — qaytadan boshlash.");
      return;
    }

    pendingSubmissions.delete(chatKey);
    await reply(ctx,
      "✅ <b>Topshirildi!</b>\n\nVazifangiz qabul qilindi. O'qituvchi tez orada baholaydi.\n\n" +
      "/homework — boshqa vazifalar\n/mystatus — statistikam",
      { reply_markup: linkedKeyboard() }
    );
  });

  // ── Callback: confirm pending file ────────────────────────────────────────
  b.callbackQuery("hw_file_confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatKey = String(ctx.chat!.id);
    const pf      = pendingFiles.get(chatKey);

    if (!pf) {
      await reply(ctx, "Tasdiqlanadigan fayl topilmadi.");
      return;
    }

    pendingFiles.delete(chatKey);

    const hf = await prisma.homeworkFile.create({
      data: {
        submissionId:   pf.submissionId,
        fileName:       pf.fileName,
        fileType:       pf.fileType,
        fileSizeBytes:  pf.fileSizeBytes,
        telegramFileId: pf.telegramFileId,
      },
      include: { submission: { select: { participantId: true, participant: { select: { fullName: true } } } } },
    });

    // Fire-and-forget: copy the Telegram file to R2 in the background so the
    // download endpoint can serve a permanent URL after the 1-hour Telegram
    // URL expires. Failure is logged but never blocks the user reply.
    void uploadTelegramFileToR2(hf.id);

    void logSubmissionEvent(prisma, {
      submissionId: pf.submissionId,
      actorId:      hf.submission.participantId,
      actorRole:    "participant",
      actorName:    hf.submission.participant.fullName,
      eventType:    SubmissionEventType.FILE_ADDED,
      meta:         { filename: pf.fileName, size: pf.fileSizeBytes, fileType: pf.fileType },
    });

    const sizeLabel = pf.fileSizeBytes ? ` (${Math.round(pf.fileSizeBytes / 1024)} KB)` : "";
    const doneKb    = new InlineKeyboard().text("✅ Yakunlash", "hw_done");
    await reply(ctx,
      `✅ <b>${pf.fileName}</b>${sizeLabel} saqlandi.\n\nYana fayl yuborishingiz yoki yakunlash tugmasini bosing.\n/cancel — bekor qilish`,
      { reply_markup: doneKb }
    );
  });

  // ── Callback: reject pending file ─────────────────────────────────────────
  b.callbackQuery("hw_file_reject", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatKey = String(ctx.chat!.id);
    pendingFiles.delete(chatKey);
    const doneKb = new InlineKeyboard().text("✅ Yakunlash", "hw_done");
    await reply(ctx,
      "❌ Fayl bekor qilindi. Qaytadan yuborishingiz yoki yakunlash tugmasini bosing.\n/cancel — topshiriqdan chiqish",
      { reply_markup: doneKb }
    );
  });

  // ── Menu callbacks ────────────────────────────────────────────────────────
  b.callbackQuery("menu_status", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = await requireParticipant(ctx);
    if (!base) return;

    const chatId = BigInt(ctx.chat!.id);
    const link   = await prisma.telegramLink.findFirst({
      where:   { chatId },
      include: {
        participant: {
          include: { trainingParticipants: { include: { training: true } } },
        },
      },
    });
    if (!link) return;

    const trainings = link.participant.trainingParticipants.map((tp) => tp.training);
    if (trainings.length === 0) {
      await reply(ctx, "📭 Siz hali hech qanday kursga yozilmagansiz.");
      return;
    }

    let text = `👤 <b>${link.participant.fullName}</b>\n`;
    text += "─".repeat(28) + "\n\n";

    for (const tr of trainings) {
      const sc  = await getParticipantScorecard(link.participantId, tr.id);
      const bar = (v: number) => {
        const filled = Math.round(v / 10);
        return "▓".repeat(filled) + "░".repeat(10 - filled) + ` <b>${v}%</b>`;
      };

      text += `📚 <b>${tr.name}</b>\n\n`;
      text +=
        `📅 Davomat: ${bar(sc.attendance.rate)}\n` +
        `   ✅ ${sc.attendance.present}  ⏰ ${sc.attendance.late}  💙 ${sc.attendance.excused}  ❌ ${sc.attendance.absent}`;
      if (sc.attendance.total > 0) text += `  (jami ${sc.attendance.total})`;
      text += "\n\n";

      if (sc.homework.total > 0) {
        text += `📝 Vazifalar: ${sc.homework.submitted}/${sc.homework.total} topshirildi`;
        if (sc.homework.avgScore !== null) text += ` · o'rtacha ${bar(sc.homework.avgScore)}`;
        if (sc.homework.deadlineComplianceRate !== null) text += ` · ⏰ O'z vaqtida: ${sc.homework.deadlineComplianceRate}%`;
        text += "\n\n";
      }

      text += `🏆 <b>Umumiy ball: ${sc.overallScore}%</b>\n`;
      text += "─".repeat(28) + "\n\n";
    }

    await reply(ctx, text.trim(), { reply_markup: linkedKeyboard() });
  });

  b.callbackQuery("menu_homework", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = await requireParticipant(ctx);
    if (!base) return;

    const chatId = BigInt(ctx.chat!.id);
    const link   = await prisma.telegramLink.findFirst({
      where:   { chatId },
      include: { participant: { include: { trainingParticipants: true } } },
    });
    if (!link) return;

    const today       = new Date().toISOString().slice(0, 10);
    const trainingIds = link.participant.trainingParticipants.map((tp) => tp.trainingId);
    const homeworks   = await prisma.homework.findMany({
      where: {
        trainingId: { in: trainingIds },
        OR: [
          { dueDate: null },
          { dueDate: { gte: today } },
          {
            AND: [
              { dueDate: { lt: today } },
              { allowLateSubmission: true },
              { OR: [{ hardCloseAt: null }, { hardCloseAt: { gte: today } }] },
            ],
          },
        ],
      },
      include: {
        training:    { select: { name: true } },
        submissions: {
          where:   { participantId: link.participantId },
          include: { grade: true, files: { select: { id: true } } },
        },
      },
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
      ],
    });

    if (homeworks.length === 0) {
      await reply(ctx, "📭 Hozircha ochiq vazifa yo'q.");
      return;
    }

    let text = "📝 <b>Vazifalar:</b>\n\n";
    const ungradedBtns: { label: string; data: string }[] = [];

    homeworks.forEach((hw, i) => {
      const sub    = hw.submissions[0];
      const graded = sub?.grade;
      const isOverdue = hw.dueDate && hw.dueDate < today;
      const icon   = graded ? "✅" : sub ? "📤" : (isOverdue ? "⏰" : "⏳");

      text +=
        `${icon} <b>${hw.title}</b>` +
        (isOverdue && !sub ? " <i>(kechikkan)</i>" : "") + "\n" +
        `   📚 ${hw.training.name}\n` +
        (hw.dueDate ? `   📅 Muddat: ${fmtUzDate(hw.dueDate)}\n`    : "") +
        (graded     ? `   ⭐ Baho: ${graded.score}/${hw.maxScore}\n` : "") +
        (sub && !graded && sub.files.length > 0
          ? `   📎 ${sub.files.length} ta fayl topshirilgan\n`       : "") +
        "\n";

      if (!graded) {
        ungradedBtns.push({ label: `${i + 1}`, data: `hw_select:${hw.id}` });
      }
    });

    if (ungradedBtns.length === 0) {
      text += "\n✅ Barcha vazifalar baholangan!";
      await reply(ctx, text, { reply_markup: linkedKeyboard() });
      return;
    }

    const kb = new InlineKeyboard();
    ungradedBtns.forEach((btn, j) => {
      if (j > 0 && j % 3 === 0) kb.row();
      kb.text(btn.label, btn.data);
    });

    text += "👇 Topshirmoqchi bo'lgan vazifa raqamini tanlang:";
    await reply(ctx, text, { reply_markup: kb });
  });

  b.callbackQuery("menu_ai", async (ctx) => {
    await ctx.answerCallbackQuery();
    await reply(ctx, "💡 Savolingizni yozing — kurs mavzulari bo'yicha javob beraman:");
  });

  b.callbackQuery("auth_login", async (ctx) => {
    await ctx.answerCallbackQuery();
    // Show contact-share keyboard so user can authenticate by phone
    const { Keyboard: K } = await import("grammy");
    const kb = new K().requestContact("📱 Telefon raqamimi ulashish").resized().oneTime();
    await reply(ctx, "📱 Telefon raqamingizni ulash uchun tugmani bosing:", { reply_markup: kb });
  });

  // ── Text messages (plain text submission + "done" fallback) ───────────────
  b.on("message:text", async (ctx) => {
    await logMessage(ctx, "in", ctx.message.text);
    const chatKey = String(ctx.chat.id);
    const text    = ctx.message.text.trim();
    const pending = pendingSubmissions.get(chatKey);

    // ── Anonymous gate ────────────────────────────────────────────────────
    // Accept either a participant link OR a staff link — the contact-share
    // handler creates whichever one matches the phone, so both count as
    // "registered" for the purpose of this gate.
    const chatId = BigInt(ctx.chat.id);
    const [participantLink, staffLink] = await Promise.all([
      prisma.telegramLink.findFirst({ where: { chatId }, select: { participantId: true } }),
      prisma.staffTelegramLink.findFirst({ where: { chatId }, select: { id: true } }),
    ]);
    if (!participantLink && !staffLink) {
      await reply(ctx,
        "🔒 Botdan foydalanish uchun avval ro'yxatdan o'ting.\n\n" +
        "Telefon raqamingizni ulash uchun /login buyrug'ini bosing."
      );
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // "done" fallback (typed instead of button)
    if (pending && pending.submissionId && text.toLowerCase() === "done") {
      pendingSubmissions.delete(chatKey);
      await reply(ctx, "✅ <b>Topshirildi!</b> Moderator tez orada baholaydi.", { reply_markup: linkedKeyboard() });
      return;
    }

    // Plain text submission
    if (pending && pending.submissionId) {
      const updatedSub = await prisma.homeworkSubmission.update({
        where:   { id: pending.submissionId },
        data:    { text },
        include: { participant: { select: { fullName: true } } },
      });
      void logSubmissionEvent(prisma, {
        submissionId: pending.submissionId,
        actorId:      updatedSub.participantId,
        actorRole:    "participant",
        actorName:    updatedSub.participant.fullName,
        eventType:    SubmissionEventType.TEXT_EDITED,
        meta:         { text: text.slice(0, 200) },
      });
      const doneKb = new InlineKeyboard().text("✅ Yakunlash", "hw_done");
      await reply(ctx,
        "✅ Matn saqlandi. Yana fayl yuborishingiz yoki ✅ Yakunlash tugmasini bosing.\n/cancel — bekor qilish",
        { reply_markup: doneKb }
      );
      return;
    }

    // ── Persistent keyboard button taps ───────────────────────────────────
    if (text === "📊 Progressim") {
      const kb = new InlineKeyboard().text("📊 Progressimni ko'rish", "menu_status");
      await reply(ctx, "📊 Progressingizni ko'rish uchun tugmani bosing:", { reply_markup: kb });
      return;
    }
    if (text === "📝 Vazifalarim") {
      const kb = new InlineKeyboard().text("📝 Vazifalarimni ko'rish", "menu_homework");
      await reply(ctx, "📝 Vazifalaringizni ko'rish uchun tugmani bosing:", { reply_markup: kb });
      return;
    }
    if (text === "💡 Savol berish") {
      await reply(ctx, "💡 Savolingizni yozing:");
      return;
    }

    // ── Check if awaiting a rating comment ────────────────────────────────
    const pendingRatingMsgId = pendingRatingComment.get(chatId.toString());
    if (pendingRatingMsgId) {
      pendingRatingComment.delete(chatId.toString());
      try {
        await prisma.botMessageRating.update({
          where: { messageId: pendingRatingMsgId },
          data:  { comment: text.slice(0, 500) },
        });
      } catch {}
      let n = 0;
      try {
        n = await prisma.botMessageRating.count({ where: { comment: { not: null } } });
      } catch {}
      await reply(ctx, `✅ Rahmat! Bu fikringiz ${n}-chi qayd — buni o'qib AI'ni yaxshilashga harakat qilaman 🙏`);
      return;
    }

    // ── Intent routing ─────────────────────────────────────────────────────
    const telegramMsgId = ctx.message?.message_id;
    const replyToTelegramMsgId = ctx.message?.reply_to_message?.message_id;
    const participantId = participantLink?.participantId ?? undefined;
    const isStaff = !!staffLink;
    const replyContext = await resolveReplyContext(chatId, replyToTelegramMsgId);
    const userMsgId = await logBotMessage({
      chatId,
      participantId,
      role: "user",
      content: text,
      telegramMsgId,
      replyToTelegramMsgId,
      replyToMessageId: replyContext?.assistantMessageId ?? null,
    });

    let intent: string;
    try {
      const result = await classifyMessage(text);
      intent = result.intent;
    } catch {
      intent = "UNCLEAR";
    }

    // ── Feedback capture (complaint / suggestion / praise) ────────────────
    if (intent === "COMPLAINT" || intent === "SUGGESTION" || intent === "PRAISE") {
      const { severity, tags } = extractFeedbackMeta(text, intent as "COMPLAINT" | "SUGGESTION" | "PRAISE");
      try {
        await prisma.studentFeedback.create({
          data: {
            chatId,
            participantId: participantLink?.participantId ?? null,
            category:      intent,
            severity:      severity ?? null,
            tags,
            messageText:   text.slice(0, 1000),
          },
        });
      } catch (err) {
        console.error("[BOT] feedback save error:", err);
      }

      if (intent === "COMPLAINT") {
        await reply(ctx, "Muammongizni bildirganingiz uchun rahmat. Tez orada ko'rib chiqamiz! 🙏");
      } else if (intent === "SUGGESTION") {
        await reply(ctx, "Taklifingiz uchun rahmat! Jamoamizga yetkazamiz 💡");
      } else {
        await reply(ctx, "Maqtovingiz uchun katta rahmat! 😊🙏");
      }
      return;
    }

    if (intent === "AI_COURSE_QUESTION" || intent === "BUSINESS_CONSULTING" || intent === "UNCLEAR") {
      await ctx.replyWithChatAction("typing");
      try {
        const memory = await loadConversationMemory(chatId, userMsgId);
        const { text: answer, raw, metadata } = await askRag({
          chat_id:        ctx.chat!.id,
          participant_id: participantId,
          question:       buildConversationAwareQuestion(text, replyContext, memory),
        });

        const DIRECT_ANSWER_LIMIT = await resolveLongAnswerLimit();
        const deliveryType = chooseDeliveryType(answer, DIRECT_ANSWER_LIMIT);
        const splitParts = deliveryType === "split" ? splitTelegramText(answer) : [];
        const msgId = await logBotMessage({
          chatId,
          participantId,
          role: "assistant",
          content: answer,
          intent,
          routedTo: "ai",
          metadata: {
            reply_context_used: Boolean(replyContext),
            memory_used: memory.shortTerm.length > 0,
            short_term_memory_count: memory.shortTerm.length,
            reply_to_message_id: userMsgId,
            replied_assistant_message_id: replyContext?.assistantMessageId ?? null,
            delivery_type: deliveryType,
            telegram_message_count: deliveryType === "split" ? splitParts.length : 1,
            answer_char_count: answer.length,
            finish_reason: metadata.finishReason,
            finish_reasons: metadata.finishReasons,
            continuation_count: metadata.continuationCount,
            completed_naturally: metadata.completedNaturally,
            incomplete_ending_detected: metadata.incompleteEndingDetected,
            completion_attempted: metadata.completionAttempted,
          },
          replyToTelegramMsgId: telegramMsgId,
          replyToMessageId: userMsgId,
        });

        if (raw) {
          void logUsage({
            messageId:      msgId ?? undefined,
            participantId:  participantId ?? undefined,
            chatId:         BigInt(chatId),
            model:          "gemini-2.5-flash",
            kind:           "chat",
            tokensIn:       raw.tokens_in,
            tokensOut:      raw.tokens_out,
            costUsd:        raw.cost_usd,
            responseTimeMs: raw.response_time_ms,
          });
        }

        if (deliveryType === "article") {
          // Long answer: save to DB, show summary + buttons
          const title   = extractTitle(answer);
          const summary = extractSummary(answer);
          const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "";

          const longAnswer = await prismaBotModels.longAnswer.create({
            data: {
              messageId:     msgId ?? undefined,
              participantId: participantId ?? undefined,
              title,
              summary,
              bodyMd: answer,
            },
          });

          const kb = new InlineKeyboard()
            .url("📖 To'liq o'qish", `${appUrl}/article/${longAnswer.id}`)
            .text("🔊 Ovozda tinglash", `tts_${msgId ?? "0"}`)
            .url("📄 PDF yuklab olish", `${appUrl}/article/${longAnswer.id}?print=1`);

          const summaryText = sanitizeMarkdown(makeLongAnswerPreview(summary));
          let sentTelegramMsgId: number | null = null;
          try {
            sentTelegramMsgId = await reply(ctx, summaryText, { parse_mode: "Markdown", reply_markup: kb });
          } catch {
            sentTelegramMsgId = await reply(ctx, makeLongAnswerPreview(summary), { reply_markup: kb });
          }
          await setBotMessageTelegramMsgId(msgId, sentTelegramMsgId);
        } else if (deliveryType === "split") {
          let firstTelegramMsgId: number | null = null;
          for (let index = 0; index < splitParts.length; index += 1) {
            const part = splitParts[index];
            const prefix = splitParts.length > 1 ? `💡 ${index + 1}/${splitParts.length}\n\n` : "💡 ";
            const isLast = index === splitParts.length - 1;
            const kb = isLast
              ? new InlineKeyboard().text("🔊 Tinglash", `tts_${msgId ?? "0"}`)
              : undefined;
            const sanitized = sanitizeMarkdown(`${prefix}${part}`);
            let sent: number | null = null;
            try {
              sent = await reply(ctx, sanitized, { parse_mode: "Markdown", ...(kb ? { reply_markup: kb } : {}) });
            } catch (mdErr) {
              if (String(mdErr).includes("can't parse")) {
                sent = await reply(ctx, `${prefix}${part}`, kb ? { reply_markup: kb } : undefined);
              } else {
                throw mdErr;
              }
            }
            firstTelegramMsgId ??= sent;
          }
          await setBotMessageTelegramMsgId(msgId, firstTelegramMsgId);
          await mergeBotMessageMetadata(msgId, { telegram_message_count: splitParts.length });
        } else {
          // Send direct answers when they fit Telegram's message limit.
          const ttsKb = new InlineKeyboard().text("🔊 Tinglash", `tts_${msgId ?? "0"}`);
          const sanitized = sanitizeMarkdown(`💡 ${answer}`);
          let sentTelegramMsgId: number | null = null;
          try {
            sentTelegramMsgId = await reply(ctx, sanitized, { parse_mode: "Markdown", reply_markup: ttsKb });
          } catch (mdErr) {
            if (String(mdErr).includes("can't parse")) {
              sentTelegramMsgId = await reply(ctx, `💡 ${answer}`, { reply_markup: ttsKb });
            } else {
              throw mdErr;
            }
          }
          await setBotMessageTelegramMsgId(msgId, sentTelegramMsgId);
        }

        // Message 2: rating prompt — separate message so it has context
        const ratingKb = new InlineKeyboard()
          .text("1", `rate_${msgId ?? "0"}_1`)
          .text("2", `rate_${msgId ?? "0"}_2`)
          .text("3", `rate_${msgId ?? "0"}_3`)
          .text("4", `rate_${msgId ?? "0"}_4`)
          .text("5", `rate_${msgId ?? "0"}_5`);
        try {
          await ctx.reply(
            "⭐ *Iltimos AI\\-yordamchi javobini baholang*\n\n_Bu bizga AI\\-yordamchi ustida ishlashga yordam beradi_ 🙏",
            { parse_mode: "MarkdownV2", reply_markup: ratingKb }
          );
        } catch {
          // Non-critical — answer already delivered
        }

        // Show "enroll in course" CTA only to anonymous users — never to
        // staff (they manage the system, not enroll in it).
        if (!participantId && !isStaff) {
          const cta = new InlineKeyboard().text("📲 Kursga yozilish", "auth_login");
          await reply(ctx, "<i>Jadval, baholar va vazifalaringizni ko'rish uchun ro'yxatdan o'ting</i>", {
            reply_markup: cta,
          });
        }
      } catch (err) {
        console.error("[BOT] askRag error:", err);
        await reply(ctx, "⚠️ AI javob bera olmadi. Keyinroq urinib ko'ring.");
      }
      return;
    }

    if (intent === "SMALL_TALK") {
      await reply(ctx, "Salom! 😊 Kurs haqida savollaringiz bormi?");
      return;
    }

    // LMS intents (SCHEDULE, HOMEWORK, GRADE, ATTENDANCE, OTHER) — show menu
    const lmsMenu = new InlineKeyboard()
      .text("📊 Progressim",  "menu_status")
      .text("📝 Vazifalarim", "menu_homework");
    await reply(ctx, "📊 Ma'lumotlaringizni ko'rish:", { reply_markup: lmsMenu });
  });

  // ── File messages (document, audio, video, voice, photo) ──────────────────
  b.on(["message:document", "message:audio", "message:video", "message:voice", "message:photo"], async (ctx) => {
    const chatKey = String(ctx.chat.id);

    // ── Anonymous gate ────────────────────────────────────────────────────
    // Accept either a participant link OR a staff link — same dual-table
    // check as the text gate above.
    const chatIdBig = BigInt(ctx.chat.id);
    const [fileParticipantLink, fileStaffLink] = await Promise.all([
      prisma.telegramLink.findFirst({ where: { chatId: chatIdBig }, select: { id: true } }),
      prisma.staffTelegramLink.findFirst({ where: { chatId: chatIdBig }, select: { id: true } }),
    ]);
    if (!fileParticipantLink && !fileStaffLink) {
      await reply(ctx,
        "🔒 Botdan foydalanish uchun avval ro'yxatdan o'ting.\n\n" +
        "Telefon raqamingizni ulash uchun /login buyrug'ini bosing."
      );
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    let   pending = pendingSubmissions.get(chatKey);

    const msg = ctx.message;
    let fileId: string | undefined;
    let fileName  = "file";
    let fileType  = "document";
    let fileSize: number | undefined;

    if (msg.document) {
      fileId   = msg.document.file_id;
      fileName = msg.document.file_name ?? "document";
      fileType = "document";
      fileSize = msg.document.file_size;
    } else if (msg.audio) {
      fileId   = msg.audio.file_id;
      fileName = msg.audio.file_name ?? "audio";
      fileType = "audio";
      fileSize = msg.audio.file_size;
    } else if (msg.video) {
      fileId   = msg.video.file_id;
      fileName = msg.video.file_name ?? "video.mp4";
      fileType = "video";
      fileSize = msg.video.file_size;
    } else if (msg.voice) {
      fileId   = msg.voice.file_id;
      fileName = "voice.ogg";
      fileType = "voice";
      fileSize = msg.voice.file_size;
    } else if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1]; // largest
      fileId   = photo.file_id;
      fileName = "photo.jpg";
      fileType = "photo";
      fileSize = photo.file_size;
    }

    await logMessage(ctx, "in", undefined, { messageType: fileType, telegramFileId: fileId, fileName, fileSizeBytes: fileSize });

    // ── Server-restart recovery: if no in-memory pending state, look in DB ──
    if (!pending || !pending.submissionId) {
      const chatId  = BigInt(ctx.chat.id);
      const link    = await prisma.telegramLink.findFirst({ where: { chatId } });
      if (link) {
        // Find the most recent open (ungraded) submission from the last 24h
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recent = await prisma.homeworkSubmission.findFirst({
          where: {
            participantId: link.participantId,
            grade:        null,
            submittedAt:  { gte: cutoff },
          },
          orderBy: { submittedAt: "desc" },
        });
        if (recent) {
          pending = { homeworkId: recent.homeworkId, submissionId: recent.id };
          pendingSubmissions.set(chatKey, pending);
        }
      }
    }

    if (!pending || !pending.submissionId) {
      await reply(ctx, "📎 Fayl qabul qilindi, lekin hozirda topshiriq tanlanmagan.\n\n/homework — vazifani tanlang.");
      return;
    }

    // Hold file in memory — ask user to confirm before writing to DB
    pendingFiles.set(chatKey, {
      submissionId:   pending.submissionId,
      fileName,
      fileType,
      fileSizeBytes:  fileSize ?? null,
      telegramFileId: fileId ?? null,
    });

    const sizeLabel  = fileSize ? ` (${Math.round(fileSize / 1024)} KB)` : "";
    const confirmKb  = new InlineKeyboard()
      .text("✅ Tasdiqlash",      "hw_file_confirm")
      .text("🔄 Qayta yuklash",   "hw_file_reject");
    await reply(ctx,
      `📎 <b>${fileName}</b>${sizeLabel}\n\nBu faylni topshiriqqa qo'shaylikmi?`,
      { reply_markup: confirmKb }
    );
  });

  // ── TTS — voice playback of AI answer ─────────────────────────────────────

  b.callbackQuery(/^tts_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "🔊 Tayyorlanmoqda..." });
    const [, msgId] = ctx.match;
    const chatId    = ctx.chat!.id;
    const api       = ctx.api;

    void (async () => {
      // ── Fetch text ────────────────────────────────────────────────────────
      let text = "";
      try {
        const stored = await prisma.botMessage.findUnique({ where: { id: msgId } });
        if (stored?.content) text = stored.content.slice(0, 5000);
      } catch {}
      if (!text) { await api.sendMessage(chatId, "❌ Matn topilmadi"); return; }

      const ragUrl   = process.env.RAG_SERVICE_URL ?? "";
      const ragToken = process.env.RAG_INTERNAL_TOKEN ?? "";

      // Show "recording" indicator
      api.sendChatAction(chatId, "record_voice").catch(() => {});
      const actionLoop = setInterval(
        () => api.sendChatAction(chatId, "record_voice").catch(() => {}),
        4000,
      );

      type TtsChunkResult = {
        idx: number;
        buf?: Buffer;
        fileId?: string;
        latencyMs?: number;
        source: "cache" | "provider";
        error?: unknown;
      };

      // ── Fetch audio progressively: first chunk first, then bounded parallel ─
      try {
        const startedAt = Date.now();
        const ttsConfig = await resolveTtsConfig();
        const textChunks = splitIntoChunks(text, ttsConfig.chunkChars, ttsConfig.firstChunkChars);
        const total = textChunks.length;
        const cached = await prismaBotModels.botTtsChunk.findMany({
          where: { messageId: msgId },
          orderBy: { idx: "asc" },
        });
        const cachedByIdx = new Map(cached.map((c) => [c.idx, c.fileId]));
        const completed = new Map<number, TtsChunkResult>();
        const chunkTelemetry: Array<{
          idx: number;
          chars: number;
          source: "cache" | "provider";
          latency_ms: number | null;
          ok: boolean;
        }> = [];
        let nextToSend = 0;
        let nextToStart = 1;
        let sentCount = 0;
        let failedChunks = 0;
        let firstAudioMs: number | null = null;
        let flushChain = Promise.resolve();

        console.log("[TTS] start", {
          messageId: msgId,
          chunkCount: total,
          chunkChars: ttsConfig.chunkChars,
          firstChunkChars: ttsConfig.firstChunkChars,
          concurrency: ttsConfig.concurrency,
          cachedChunks: cached.length,
        });

        const fetchChunk = async (idx: number): Promise<TtsChunkResult> => {
          const cachedFileId = cachedByIdx.get(idx);
          if (cachedFileId) {
            chunkTelemetry.push({ idx, chars: textChunks[idx].length, source: "cache", latency_ms: null, ok: true });
            return { idx, fileId: cachedFileId, source: "cache" };
          }

          const chunkStartedAt = Date.now();
          try {
            const res = await fetch(`${ragUrl}/tts`, {
              method:  "POST",
              headers: { "Content-Type": "application/json", "X-Internal-Token": ragToken },
              body:    JSON.stringify({ text: textChunks[idx], chat_id: Number(chatId) }),
              signal:  AbortSignal.timeout(120_000),
            });
            if (!res.ok) throw new Error(`http ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            const latencyMs = Date.now() - chunkStartedAt;
            chunkTelemetry.push({ idx, chars: textChunks[idx].length, source: "provider", latency_ms: latencyMs, ok: true });
            console.log("[TTS] chunk_generated", {
              messageId: msgId,
              idx,
              chars: textChunks[idx].length,
              provider_latency_ms: latencyMs,
            });
            return { idx, buf, latencyMs, source: "provider" };
          } catch (error) {
            const latencyMs = Date.now() - chunkStartedAt;
            chunkTelemetry.push({ idx, chars: textChunks[idx].length, source: "provider", latency_ms: latencyMs, ok: false });
            console.error("[TTS] chunk_failed", {
              messageId: msgId,
              idx,
              chars: textChunks[idx].length,
              provider_latency_ms: latencyMs,
              error,
            });
            return { idx, latencyMs, source: "provider", error };
          }
        };

        const flushReadyChunks = async () => {
          while (completed.has(nextToSend)) {
            const result = completed.get(nextToSend)!;
            completed.delete(nextToSend);

            if (result.error || (!result.buf && !result.fileId)) {
              failedChunks++;
              nextToSend++;
              continue;
            }

            const caption = total > 1 ? `🎙 ${result.idx + 1}/${total}` : undefined;
            const voice = result.fileId ?? new InputFile(result.buf!, "voice.ogg");
            const msg = await api.sendVoice(chatId, voice, { caption });
            sentCount++;

            if (firstAudioMs === null) {
              firstAudioMs = Date.now() - startedAt;
              console.log(`[TTS] time_to_first_audio_ms=${firstAudioMs} messageId=${msgId}`);
            }

            const fileId = msg.voice?.file_id;
            if (!result.fileId && fileId && msgId) {
              await prismaBotModels.botTtsChunk.create({ data: { messageId: msgId, idx: result.idx, fileId } }).catch(() => {});
            }
            nextToSend++;
          }
        };

        const queueFlush = async () => {
          flushChain = flushChain.then(flushReadyChunks, flushReadyChunks);
          await flushChain;
        };

        completed.set(0, await fetchChunk(0));
        await queueFlush();

        const worker = async () => {
          while (nextToStart < total) {
            const idx = nextToStart++;
            completed.set(idx, await fetchChunk(idx));
            await queueFlush();
          }
        };

        await Promise.all(Array.from({ length: Math.min(ttsConfig.concurrency, Math.max(0, total - 1)) }, () => worker()));
        await queueFlush();

        const totalMs = Date.now() - startedAt;
        console.log("[TTS] complete", {
          messageId: msgId,
          chunkCount: total,
          failedChunks,
          sentCount,
          config: ttsConfig,
          time_to_first_audio_ms: firstAudioMs,
          total_tts_time_ms: totalMs,
          chunks: chunkTelemetry.sort((a, b) => a.idx - b.idx),
        });
        void logUsage({
          messageId:      msgId !== "0" ? msgId : undefined,
          chatId:         BigInt(chatId),
          model:          "gemini-2.5-flash-preview-tts",
          kind:           "tts",
          costUsd:        0,
          responseTimeMs: totalMs,
        });

        if (failedChunks > 0 && sentCount > 0) {
          await api.sendMessage(chatId, `⚠️ ${failedChunks} ta audio bo'lagi tayyorlanmadi. Iltimos, qayta urinib ko'ring.`);
        } else if (!sentCount) {
          await api.sendMessage(chatId, "❌ Ovoz yaratib bo'lmadi");
        }
      } finally {
        clearInterval(actionLoop);
      }
    })();
  });

  // ── 5-star ratings ────────────────────────────────────────────────────────

  b.callbackQuery(/^rate_(.+)_(\d)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, msgId, starsStr] = ctx.match;
    const stars = parseInt(starsStr, 10);

    try {
      await prisma.botMessageRating.upsert({
        where:  { messageId: msgId },
        create: { messageId: msgId, stars, participantId: null },
        update: { stars },
      });
    } catch { /* msgId "0" fallback — no BotMessage exists */ }

    // Edit the rating message in place — buttons disappear, confirmation appears
    try {
      await ctx.editMessageText(`✅ Rahmat! Sizning bahoyingiz: ${stars}⭐`);
    } catch { /* message too old or already edited — ignore */ }

    if (stars <= 3) {
      // Ask for reason on 1–3⭐ only — 4–5⭐ users are happy, leave them alone
      await ctx.reply(
        "Yordam bering — nima xato edi? Buni o'qib, AI'ni yaxshilashga harakat qilaman 🙏",
        { reply_markup: reasonKeyboard(msgId) },
      );
    }
  });

  b.callbackQuery(/^reason_(wrong|unclear|slow|offtopic|tooshort|toolong|other)_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, reason, msgId] = ctx.match;
    const chatId = BigInt(ctx.chat!.id);

    try {
      await prisma.botMessageRating.update({
        where: { messageId: msgId },
        data:  { reason },
      });
    } catch {}

    if (reason === "other") {
      pendingRatingComment.set(chatId.toString(), msgId);
      try {
        await ctx.editMessageText(
          "✍️ Nima xato edi? Yozing:\n\n" +
          "_Misol: \"noto'g'ri ism aytdi\", \"savolimni tushunmadi\", \"juda umumiy javob\"_",
          { parse_mode: "Markdown" },
        );
      } catch {}
    } else {
      // Count total rated+commented ratings for the dopamine number
      let n = 0;
      try {
        n = await prisma.botMessageRating.count({ where: { reason: { not: null } } });
      } catch {}
      try {
        await ctx.editMessageText(
          `✅ Rahmat! Fikringiz qayd etildi — bu yaxshilanish uchun ${n}-chi signal 🛠`,
        );
      } catch {}
    }
  });
}
