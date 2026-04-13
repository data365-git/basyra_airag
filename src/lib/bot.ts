/**
 * grammy bot — all conversation logic lives here.
 * Env:  TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_APP_URL
 */

import { Bot, Context, InlineKeyboard } from "grammy";
import prisma from "@/lib/prisma";
import { getParticipantScorecard } from "@/lib/scorecard";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://basyralmss-production.up.railway.app";

/** Inline keyboard with the portal Web App button */
function portalKeyboard() {
  return new InlineKeyboard().webApp("🌐 Shaxsiy kabinetim", `${APP_URL}/portal/login`);
}

let bot: Bot | null = null;

export function getBot(): Bot {
  if (bot) return bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  bot = new Bot(token);
  registerHandlers(bot);
  return bot;
}

// ─── Message logging ──────────────────────────────────────────────────────────

async function logMessage(ctx: Context, direction: "in" | "out", text?: string, extra?: {
  messageType?: string;
  telegramFileId?: string;
  fileName?: string;
  fileSizeBytes?: number;
  telegramMsgId?: number;
}) {
  try {
    const chatId       = BigInt(ctx.chat!.id);
    const link         = await prisma.telegramLink.findFirst({ where: { chatId } });
    const msgId        = ctx.message?.message_id ?? extra?.telegramMsgId;

    await prisma.telegramMessage.create({
      data: {
        chatId,
        participantId: link?.participantId ?? null,
        direction,
        text:          text ?? null,
        messageType:   extra?.messageType ?? "text",
        telegramFileId: extra?.telegramFileId ?? null,
        fileName:      extra?.fileName ?? null,
        fileSizeBytes: extra?.fileSizeBytes ?? null,
        telegramMsgId: msgId ?? null,
      },
    });
  } catch {
    // Non-critical — never fail the main flow
  }
}

// ─── Send + log a bot reply ───────────────────────────────────────────────────

async function reply(ctx: Context, text: string, options?: object): Promise<void> {
  const msg = await ctx.reply(text, { parse_mode: "HTML", ...options });
  await logMessage(ctx, "out", text, { telegramMsgId: msg.message_id });
}

// ─── Pending submission state (in-memory, per chatId) ────────────────────────
// Key: chatId string  Value: { homeworkId, step: "awaiting_files" | "done" }

const pendingSubmissions = new Map<string, { homeworkId: string; submissionId: string | null }>();

// ─── Handlers ─────────────────────────────────────────────────────────────────

function registerHandlers(b: Bot) {

  // ── /start [CODE] ───────────────────────────────────────────────────────────
  b.command("start", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const code = ctx.match?.trim();

    if (!code) {
      await reply(ctx,
        "👋 <b>Assalomu alaykum!</b>\n\n" +
        "Bu Basyra o'quv markazi botidir.\n\n" +
        "Hisobingizni ulash uchun administratoringizdan <b>havola</b> oling.\n\n" +
        "Buyruqlar:\n/mystatus — statistikam\n/homework — vazifalar",
        { reply_markup: portalKeyboard() }
      );
      return;
    }

    const linkCode = await prisma.telegramLinkCode.findUnique({
      where:   { code },
      include: { participant: true },
    });

    if (!linkCode) {
      await reply(ctx, "❌ Kod noto'g'ri yoki muddati o'tgan. Administratoringizdan yangi havola so'rang.");
      return;
    }
    if (linkCode.expiresAt < new Date()) {
      await prisma.telegramLinkCode.delete({ where: { code } }).catch(() => null);
      await reply(ctx, "⏰ Havolaning muddati o'tgan. Administratoringizdan yangi havola so'rang.");
      return;
    }

    const chatId    = BigInt(ctx.chat!.id);
    const firstName = ctx.from?.first_name ?? null;
    const username  = ctx.from?.username   ?? null;

    await prisma.telegramLink.upsert({
      where:  { participantId: linkCode.participantId },
      update: { chatId, username, firstName },
      create: { participantId: linkCode.participantId, chatId, username, firstName },
    });

    await prisma.telegramLinkCode.delete({ where: { code } }).catch(() => null);

    await reply(ctx,
      `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n` +
      `Xush kelibsiz, <b>${linkCode.participant.fullName}</b>!\n\n` +
      `📊 /mystatus — davomat va baholar\n` +
      `📝 /homework — vazifalar\n\n` +
      `👇 Shaxsiy kabinetingizga kirish uchun tugmani bosing:`,
      { reply_markup: portalKeyboard() }
    );
  });

  // ── /mystatus ───────────────────────────────────────────────────────────────
  b.command("mystatus", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const chatId = BigInt(ctx.chat!.id);
    const link   = await prisma.telegramLink.findFirst({
      where:   { chatId },
      include: {
        participant: {
          include: { trainingParticipants: { include: { training: true } } },
        },
      },
    });

    if (!link) {
      await reply(ctx, "⚠️ Hisobingiz ulanmagan.\n\nAdministratoringizdan havola oling.");
      return;
    }

    const trainings = link.participant.trainingParticipants.map((tp) => tp.training);
    if (trainings.length === 0) {
      await reply(ctx, "📭 Siz hali hech qanday kursga yozilmagansiz.");
      return;
    }

    let text = `📊 <b>${link.participant.fullName}</b>\n\n`;

    for (const tr of trainings) {
      const sc = await getParticipantScorecard(link.participantId, tr.id);
      const bar = (v: number) => "█".repeat(Math.round(v / 10)) + "░".repeat(10 - Math.round(v / 10)) + ` ${v}%`;

      text +=
        `📚 <b>${tr.name}</b>\n` +
        `📅 Davomat: ${bar(sc.attendance.rate)}\n` +
        `  ✅ ${sc.attendance.present}  ⏰ ${sc.attendance.late}  ❌ ${sc.attendance.absent}\n`;

      if (sc.homework.total > 0) {
        text += `📝 Vazifalar: ${sc.homework.submitted}/${sc.homework.total}`;
        if (sc.homework.avgScore !== null) text += ` · avg ${sc.homework.avgScore}%`;
        text += "\n";
      }
      if (sc.activity.avgScore !== null) {
        text += `⚡ Faollik: ${bar(sc.activity.avgScore)} (${sc.activity.count} ta sessiya)\n`;
      }
      text += `⭐ <b>Umumiy: ${sc.overallScore}%</b>\n\n`;
    }

    await reply(ctx, text.trim());
  });

  // ── /homework ───────────────────────────────────────────────────────────────
  b.command("homework", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const chatId = BigInt(ctx.chat!.id);
    const link   = await prisma.telegramLink.findFirst({
      where:   { chatId },
      include: { participant: { include: { trainingParticipants: true } } },
    });

    if (!link) {
      await reply(ctx, "⚠️ Hisobingiz ulanmagan. Administratoringizdan havola oling.");
      return;
    }

    const trainingIds = link.participant.trainingParticipants.map((tp) => tp.trainingId);
    const homeworks   = await prisma.homework.findMany({
      where:   { trainingId: { in: trainingIds } },
      include: {
        training:    { select: { name: true } },
        submissions: {
          where:  { participantId: link.participantId },
          select: { id: true, grade: { select: { score: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (homeworks.length === 0) {
      await reply(ctx, "📭 Hozircha ochiq vazifa yo'q.");
      return;
    }

    let text = "📝 <b>Vazifalar:</b>\n\n";
    homeworks.forEach((hw, i) => {
      const sub  = hw.submissions[0];
      const done = !!sub;
      const graded = sub?.grade;
      text +=
        `${i + 1}. ${done ? (graded ? "✅" : "📤") : "⏳"} <b>${hw.title}</b>\n` +
        `   📚 ${hw.training.name}\n` +
        (hw.dueDate ? `   📅 Muddat: ${hw.dueDate}\n` : "") +
        (graded ? `   ⭐ Baho: ${graded.score}/${hw.maxScore}\n` : "") +
        "\n";
    });

    text += `\nTopshirish uchun raqam yuboring (1–${homeworks.length})`;

    // Store homework list in pending state for number selection
    const chatKey = String(ctx.chat!.id);
    (ctx as any)._hwList = homeworks; // temp storage for reply handler
    pendingSubmissions.set(chatKey, { homeworkId: "__selecting__", submissionId: null });
    // Store the list for number lookup
    homeworkListCache.set(chatKey, homeworks.map((hw) => hw.id));

    await reply(ctx, text);
  });

  // ── Text messages (number selection + "done") ────────────────────────────
  b.on("message:text", async (ctx) => {
    await logMessage(ctx, "in", ctx.message.text);
    const chatKey = String(ctx.chat.id);
    const text    = ctx.message.text.trim();
    const pending = pendingSubmissions.get(chatKey);

    // Number selection — pick a homework
    if (pending?.homeworkId === "__selecting__") {
      const idx  = parseInt(text, 10) - 1;
      const list = homeworkListCache.get(chatKey) ?? [];
      const hwId = list[idx];
      if (!hwId) {
        await reply(ctx, "Noto'g'ri raqam. /homework buyrug'ini qayta yuboring.");
        return;
      }

      const hw = await prisma.homework.findUnique({ where: { id: hwId } });
      if (!hw) { await reply(ctx, "Vazifa topilmadi."); return; }

      // Create or find submission
      const chatId = BigInt(ctx.chat.id);
      const link   = await prisma.telegramLink.findFirst({ where: { chatId } });
      if (!link) { await reply(ctx, "Hisob ulanmagan."); return; }

      const sub = await prisma.homeworkSubmission.upsert({
        where:  { homeworkId_participantId: { homeworkId: hwId, participantId: link.participantId } },
        update: {},
        create: { homeworkId: hwId, participantId: link.participantId },
      });

      pendingSubmissions.set(chatKey, { homeworkId: hwId, submissionId: sub.id });

      await reply(ctx,
        `📎 <b>${hw.title}</b>\n\n` +
        `Fayl yuboring (hujjat, audio, video, rasm) yoki matn yozing.\n` +
        `Tugatgach <b>done</b> deb yozing.`
      );
      return;
    }

    // "done" — finish submission
    if (pending && pending.homeworkId !== "__selecting__" && text.toLowerCase() === "done") {
      pendingSubmissions.delete(chatKey);
      await reply(ctx, "✅ <b>Topshirildi!</b> Moderator tez orada baholaydi.");
      return;
    }

    // Plain text submission
    if (pending && pending.homeworkId !== "__selecting__" && pending.submissionId) {
      await prisma.homeworkSubmission.update({
        where: { id: pending.submissionId },
        data:  { text },
      });
      await reply(ctx, "✅ Matn saqlandi. Yana fayl yuborishingiz yoki <b>done</b> deb yozishingiz mumkin.");
      return;
    }

    // Unrecognised
    await reply(ctx,
      "Buyruqlar:\n/mystatus — statistikam\n/homework — vazifalar",
      { reply_markup: portalKeyboard() }
    );
  });

  // ── File messages (document, audio, video, voice, photo) ────────────────
  b.on(["message:document", "message:audio", "message:video", "message:voice", "message:photo"], async (ctx) => {
    const chatKey = String(ctx.chat.id);
    const pending = pendingSubmissions.get(chatKey);

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

    if (!pending || pending.homeworkId === "__selecting__" || !pending.submissionId) {
      await reply(ctx, "📎 Fayl qabul qilindi, lekin hozirda topshiriq tanlanmagan.\n\nAvval /homework buyrug'ini yuboring.");
      return;
    }

    // Save HomeworkFile record (storageUrl will be filled when R2 download is implemented)
    await prisma.homeworkFile.create({
      data: {
        submissionId:   pending.submissionId,
        fileName,
        fileType,
        fileSizeBytes:  fileSize ?? null,
        telegramFileId: fileId ?? null,
      },
    });

    const kb = fileSize ? ` (${Math.round(fileSize / 1024)} KB)` : "";
    await reply(ctx, `✅ Fayl qabul qilindi${kb}. Yana fayl yuborishingiz yoki <b>done</b> deb yozishingiz mumkin.`);
  });
}

// ─── In-memory homework list cache ────────────────────────────────────────────
// Maps chatId → list of homeworkIds in the order shown

const homeworkListCache = new Map<string, string[]>();

// ─── Notify attendee when their submission is graded ─────────────────────────

export async function notifyGraded(opts: {
  participantId: string;
  homeworkTitle: string;
  score:         number;
  maxScore:      number;
  feedback?:     string | null;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const link = await prisma.telegramLink.findUnique({
    where: { participantId: opts.participantId },
  });
  if (!link) return;

  const text =
    `📝 <b>Uyga vazifangiz baholandi!</b>\n\n` +
    `📚 ${opts.homeworkTitle}\n` +
    `⭐ Ball: <b>${opts.score}/${opts.maxScore}</b>\n` +
    (opts.feedback ? `\n💬 Moderator izohi: "${opts.feedback}"` : "");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: Number(link.chatId), text, parse_mode: "HTML" }),
    });

    // Log outbound message
    await prisma.telegramMessage.create({
      data: {
        chatId:        link.chatId,
        participantId: opts.participantId,
        direction:     "out",
        text,
        messageType:   "text",
      },
    });
  } catch {
    // non-critical
  }
}
