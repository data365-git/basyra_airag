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

import { Bot, InlineKeyboard } from "grammy";
import prisma from "@/lib/prisma";
import { getParticipantScorecard } from "@/lib/scorecard";
import { uploadTelegramFileToR2 } from "@/lib/r2Upload";
import { logSubmissionEvent, SubmissionEventType } from "@/lib/submissionEvents";
import { requireParticipant } from "@/lib/botAuth";
import { linkedKeyboard, logMessage, reply } from "./ui";
import { pendingSubmissions, pendingFiles, pendingRatingComment } from "./state";
import { classifyMessage } from "@/lib/intentRouter";
import { askRag, logBotMessage } from "@/lib/aiClient";

const UZ_MONTHS = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];

function fmtUzDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return `${dt.getDate()} ${UZ_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

function buildHomeMenu() {
  return new InlineKeyboard()
    .text("📊 Mening progressim", "menu_status").row()
    .text("📝 Uy vazifam",        "menu_homework").row()
    .text("💡 Savol berish",      "menu_ai").row()
    .text("📅 Jadvalim",          "menu_schedule");
}

function reasonKeyboard(msgId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Noto'g'ri",         `reason_wrong_${msgId}`)
    .text("Tushunarsiz",       `reason_unclear_${msgId}`).row()
    .text("Mavzudan tashqari", `reason_offtopic_${msgId}`)
    .text("Boshqa",            `reason_other_${msgId}`);
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
      "📅 Jadvalim — dars jadvali",
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
      orderBy: { createdAt: "asc" },
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
        `${i + 1}. ${icon} <b>${hw.title}</b>` +
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

  b.callbackQuery("menu_schedule", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = await requireParticipant(ctx);
    if (!base) return;
    // TODO: implement schedule lookup
    await reply(ctx, "📅 Jadvalingiz yuklanmoqda...");
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
    if (text === "📅 Jadvalim") {
      const kb = new InlineKeyboard().text("📅 Jadvalimni ko'rish", "menu_schedule");
      await reply(ctx, "📅 Jadvalingizni ko'rish uchun tugmani bosing:", { reply_markup: kb });
      return;
    }
    if (text === "💡 Savol berish") {
      await reply(ctx, "💡 Savolingizni yozing:");
      return;
    }

    // ── Check if awaiting a rating comment ────────────────────────────────
    const chatId = BigInt(ctx.chat!.id);
    const pendingRatingMsgId = pendingRatingComment.get(chatId.toString());
    if (pendingRatingMsgId) {
      pendingRatingComment.delete(chatId.toString());
      try {
        await prisma.botMessageRating.update({
          where: { messageId: pendingRatingMsgId },
          data:  { comment: text.slice(0, 500) },
        });
      } catch {}
      await reply(ctx, "Fikr-mulohazangiz uchun rahmat! 🙏");
      return;
    }

    // ── Intent routing ─────────────────────────────────────────────────────
    await logBotMessage({ chatId, role: "user", content: text });

    let intent: string;
    try {
      const result = await classifyMessage(text);
      intent = result.intent;
    } catch {
      intent = "UNCLEAR";
    }

    if (intent === "AI_COURSE_QUESTION" || intent === "UNCLEAR") {
      await ctx.replyWithChatAction("typing");
      const linkRow = await prisma.telegramLink.findFirst({ where: { chatId }, select: { participantId: true } });
      const participantId = linkRow?.participantId ?? undefined;
      try {
        const { text: answer, raw } = await askRag({
          chat_id:        ctx.chat!.id,
          participant_id: participantId,
          question:       text,
        });

        const msgId = await logBotMessage({ chatId, role: "assistant", content: answer, intent, routedTo: "ai" });

        const kb = new InlineKeyboard()
          .text("🔊 Tinglash", `tts_${msgId ?? "0"}`).row()
          .text("⭐",     `rate_1_${msgId ?? "0"}`)
          .text("⭐⭐",    `rate_2_${msgId ?? "0"}`)
          .text("⭐⭐⭐",   `rate_3_${msgId ?? "0"}`)
          .text("⭐⭐⭐⭐",  `rate_4_${msgId ?? "0"}`)
          .text("⭐⭐⭐⭐⭐", `rate_5_${msgId ?? "0"}`);

        await reply(ctx, `💡 ${answer}`, { reply_markup: kb });

        if (!participantId) {
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
      .text("📝 Vazifalarim", "menu_homework").row()
      .text("📅 Jadvalim",    "menu_schedule");
    await reply(ctx, "📊 Ma'lumotlaringizni ko'rish:", { reply_markup: lmsMenu });
  });

  // ── File messages (document, audio, video, voice, photo) ──────────────────
  b.on(["message:document", "message:audio", "message:video", "message:voice", "message:photo"], async (ctx) => {
    const chatKey = String(ctx.chat.id);
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

  // ── 5-star ratings ────────────────────────────────────────────────────────

  b.callbackQuery(/^rate_(\d)_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, starsStr, msgId] = ctx.match;
    const stars = parseInt(starsStr, 10);

    try {
      await prisma.botMessageRating.upsert({
        where:  { messageId: msgId },
        create: { messageId: msgId, stars, participantId: null },
        update: { stars },
      });
    } catch { /* msgId "0" fallback — no BotMessage exists */ }

    if (stars <= 2) {
      await ctx.editMessageReplyMarkup({ reply_markup: reasonKeyboard(msgId) });
      await reply(ctx, `${"⭐".repeat(stars)} — Nima yaxshi bo'lmadi?`);
    } else {
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      await reply(ctx, `${"⭐".repeat(stars)} Rahmat! 🙏`);
    }
  });

  b.callbackQuery(/^reason_(wrong|unclear|offtopic|other)_(.+)$/, async (ctx) => {
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
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      await reply(ctx, "Iltimos, nima kamchilik bo'lganini yozing (yoki /cancel):");
    } else {
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      await reply(ctx, "Rahmat! Javobni yaxshilashga harakat qilamiz 🛠");
    }
  });
}
