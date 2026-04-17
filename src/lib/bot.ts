/**
 * grammy bot — all conversation logic lives here.
 * Env:  TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_APP_URL
 */

import { randomUUID } from "crypto";
import { Bot, Context, InlineKeyboard, Keyboard } from "grammy";
import prisma from "@/lib/prisma";
import { getParticipantScorecard } from "@/lib/scorecard";
import { uploadTelegramFileToR2 } from "@/lib/r2Upload";
import { logSubmissionEvent, SubmissionEventType } from "@/lib/submissionEvents";
import { requireParticipant, logAuth, checkRateLimit, promptLogin } from "@/lib/botAuth";
import { normalizePhone } from "@/lib/phone";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://basyra-lmss.up.railway.app").replace(/\/$/, "");

const UZ_MONTHS = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
function fmtUzDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return `${dt.getDate()} ${UZ_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** Keyboard shown AFTER successful linking — opens portal dashboard directly */
function linkedKeyboard() {
  return new InlineKeyboard().webApp("📊 Shaxsiy kabinetni ochish", `${APP_URL}/portal/me`);
}

/** Keyboard shown to unlinked users — /portal/me handles auth + redirect */
function loginKeyboard() {
  return new InlineKeyboard().webApp("🌐 Shaxsiy kabinet", `${APP_URL}/portal/me`);
}

let bot: Bot | null = null;

export function getBot(): Bot {
  if (bot) return bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  bot = new Bot(token);
  registerHandlers(bot);

  // Set the persistent menu button (bottom-left in every chat with this bot).
  // grammy 1.x method is setChatMenuButton — omitting chat_id sets the default.
  bot.api.setChatMenuButton({
    menu_button: {
      type:    "web_app",
      text:    "Kabinet",
      web_app: { url: `${APP_URL}/portal/me` },
    },
  }).catch((e: unknown) => console.error("[BOT] Failed to set menu button:", e));

  // Register slash-command autocomplete list shown when user types "/".
  bot.api.setMyCommands([
    { command: "start",    description: "Botni boshlash" },
    { command: "login",    description: "Kabinetga kirish" },
    { command: "mystatus", description: "Mening statistikam" },
    { command: "homework", description: "Vazifalar ro'yxati" },
    { command: "cancel",   description: "Amalni bekor qilish" },
    { command: "logout",   description: "Akkauntni uzish" },
    { command: "privacy",  description: "Maxfiylik siyosati" },
    { command: "delete",   description: "Akkauntni o'chirish" },
    { command: "debug",    description: "Diagnostika ma'lumoti" },
  ]).catch((e: unknown) => console.error("[BOT] setMyCommands failed:", e));

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
const pendingSubmissions = new Map<string, { homeworkId: string; submissionId: string | null }>();

// ─── Pending file awaiting confirmation (in-memory, per chatId) ───────────────
// Set when user sends a file; cleared after confirm/reject/cancel.
interface PendingFile {
  submissionId: string;
  fileName:     string;
  fileType:     string;
  fileSizeBytes: number | null;
  telegramFileId: string | null;
}
const pendingFiles = new Map<string, PendingFile>();

// ─── Handlers ─────────────────────────────────────────────────────────────────

function registerHandlers(b: Bot) {

  // ── /start [CODE] ───────────────────────────────────────────────────────────
  b.command("start", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const code = ctx.match?.trim();

    if (!code) {
      const chatId = BigInt(ctx.chat!.id);
      // Check rate limit before showing keyboard
      const rlKey = `login:${ctx.chat!.id}`;
      if (!(await checkRateLimit(ctx, rlKey, "login"))) return;

      // If already linked, greet and show menu
      const existing = await prisma.telegramLink.findFirst({ where: { chatId } });
      if (existing) {
        await reply(ctx,
          "✅ Hisobingiz ulangan!\n\n" +
          "📊 /mystatus — davomat va baholar\n" +
          "📝 /homework — vazifalar\n" +
          "🚪 /logout — akkauntni uzish",
          { reply_markup: linkedKeyboard() }
        );
        return;
      }

      // Not linked — show contact-share keyboard directly
      const kb = new Keyboard()
        .requestContact("📱 Telefon raqamimi ulashish")
        .resized()
        .oneTime();
      await reply(ctx,
        "👋 <b>Assalomu alaykum!</b>\n\n" +
        "Bu Basyra o'quv markazi botidir.\n\n" +
        "Davom etish uchun telefon raqamingizni ulashing — " +
        "Telegram profilida saqlangan raqamingiz avtomatik yuboriladi:",
        { reply_markup: kb }
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
      { reply_markup: linkedKeyboard() }
    );
  });

  // ── /mystatus ───────────────────────────────────────────────────────────────
  b.command("mystatus", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const base = await requireParticipant(ctx);
    if (!base) return;

    // Re-fetch with full training relations
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

      // Attendance
      text +=
        `📅 Davomat: ${bar(sc.attendance.rate)}\n` +
        `   ✅ ${sc.attendance.present}  ⏰ ${sc.attendance.late}  💙 ${sc.attendance.excused}  ❌ ${sc.attendance.absent}`;
      if (sc.attendance.total > 0) text += `  (jami ${sc.attendance.total})`;
      text += "\n\n";

      // Homework
      if (sc.homework.total > 0) {
        text += `📝 Vazifalar: ${sc.homework.submitted}/${sc.homework.total} topshirildi`;
        if (sc.homework.avgScore !== null) text += ` · o'rtacha ${bar(sc.homework.avgScore)}`;
        text += "\n\n";
      }

      // Activity
      if (sc.activity.count > 0 && sc.activity.avgScore !== null) {
        text += `⚡ Faollik: ${bar(sc.activity.avgScore)} (${sc.activity.count} sessiya)\n\n`;
      }

      text += `🏆 <b>Umumiy ball: ${sc.overallScore}%</b>\n`;
      text += "─".repeat(28) + "\n\n";
    }

    await reply(ctx, text.trim(), { reply_markup: linkedKeyboard() });
  });

  // ── /cancel ─────────────────────────────────────────────────────────────────
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

  // ── Catch-all callback_query log — proves callbacks are arriving at all ──────
  // Registered BEFORE the typed handlers so it logs every incoming callback even
  // when the typed handler later answers and short-circuits.
  b.on("callback_query:data", async (ctx, next) => {
    console.log("[BOT] callback_query received:",
      JSON.stringify({ data: ctx.callbackQuery.data, chatId: ctx.chat?.id, userId: ctx.from?.id }));
    await next();
  });

  b.command("cancel", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const chatKey = String(ctx.chat!.id);
    const hadPending = pendingSubmissions.has(chatKey) || pendingFiles.has(chatKey);
    pendingSubmissions.delete(chatKey);
    pendingFiles.delete(chatKey);
    if (hadPending) {
      await reply(ctx, "❌ Topshiriq jarayoni bekor qilindi.\n\n/homework — qaytadan boshlash");
    } else {
      await reply(ctx, "Hozirda faol jarayon yo'q.\n\n/homework — vazifalarni ko'rish");
    }
  });

  // ── /homework ───────────────────────────────────────────────────────────────
  b.command("homework", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const base = await requireParticipant(ctx);
    if (!base) return;

    // Re-fetch with training relations
    const chatId = BigInt(ctx.chat!.id);
    const link   = await prisma.telegramLink.findFirst({
      where:   { chatId },
      include: { participant: { include: { trainingParticipants: true } } },
    });
    if (!link) return;

    const today       = new Date().toISOString().slice(0, 10); // UTC date is fine for display filter
    const trainingIds = link.participant.trainingParticipants.map((tp) => tp.trainingId);
    const homeworks   = await prisma.homework.findMany({
      where: {
        trainingId: { in: trainingIds },
        // Filter: show only homeworks with no dueDate, or dueDate >= today
        OR: [{ dueDate: null }, { dueDate: { gte: today } }],
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
      const icon   = graded ? "✅" : sub ? "📤" : "⏳";

      text +=
        `${i + 1}. ${icon} <b>${hw.title}</b>\n` +
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

    // Build keyboard: numbered buttons grouped 3 per row
    const kb = new InlineKeyboard();
    ungradedBtns.forEach((btn, j) => {
      if (j > 0 && j % 3 === 0) kb.row();
      kb.text(btn.label, btn.data);
    });

    text += "👇 Topshirmoqchi bo'lgan vazifa raqamini tanlang:";
    await reply(ctx, text, { reply_markup: kb });
  });

  // ── /login — phone number authentication ────────────────────────────────
  b.command("login", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const chatId = BigInt(ctx.chat!.id);

    if (!(await checkRateLimit(ctx, `login:${ctx.chat!.id}`, "login"))) return;

    // Already linked → just open the portal
    const existing = await prisma.telegramLink.findFirst({
      where:   { chatId },
      include: { participant: { select: { isBlocked: true } } },
    });
    if (existing) {
      if (existing.participant.isBlocked) {
        await ctx.reply("🚫 Akkauntingiz bloklangan. Administrator bilan bog'laning.");
        return;
      }
      await reply(ctx,
        "✅ Hisobingiz allaqachon ulangan!\n\n👇 Shaxsiy kabinetni ochish uchun tugmani bosing:",
        { reply_markup: linkedKeyboard() }
      );
      return;
    }

    await promptLogin(ctx);
  });

  // ── /logout — unlink Telegram (keeps participant record) ─────────────────
  b.command("logout", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const chatId = BigInt(ctx.chat!.id);
    const link   = await prisma.telegramLink.findFirst({ where: { chatId } });
    if (!link) {
      await reply(ctx, "Hisob hali ulanmagan.");
      return;
    }
    await prisma.telegramLink.delete({ where: { id: link.id } }).catch(() => null);
    await logAuth(ctx, "logout");
    await reply(ctx,
      "✅ Telegram akkauntingiz uzildi.\n\nQayta ulash uchun /login yuboring.",
      { reply_markup: { remove_keyboard: true } }
    );
  });

  // ── /privacy ─────────────────────────────────────────────────────────────
  b.command("privacy", async (ctx) => {
    await reply(ctx,
      "🔒 <b>Maxfiylik siyosati</b>\n\n" +
      "Biz siz haqingizda quyidagi ma'lumotlarni saqlaymiz:\n" +
      "• Telegram foydalanuvchi ID va ism\n" +
      "• Telefon raqamingiz (davomat va vazifalar uchun)\n" +
      "• Davomat tarixi va baholash natijalari\n\n" +
      "Ma'lumotlaringiz faqat o'quv markazi doirasida ishlatiladi, " +
      "uchinchi shaxslarga berilmaydi.\n\n" +
      "Akkauntingizni o'chirish: /delete",
      { reply_markup: { remove_keyboard: true } }
    );
  });

  // ── /delete — self-service account deletion ───────────────────────────────
  b.command("delete", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const kb = new InlineKeyboard()
      .text("✅ Ha, o'chirish", "confirm_delete")
      .text("❌ Bekor qilish", "cancel_delete");
    await reply(ctx,
      "⚠️ <b>Diqqat!</b>\n\n" +
      "Bu amal Telegram akkauntingizni tizimdan uzadi.\n" +
      "Davomat va baho tarixingiz administratorlar uchun saqlanib qoladi.\n\n" +
      "Davom etasizmi?",
      { reply_markup: kb }
    );
  });

  // ── Contact message — phone number received ──────────────────────────────
  b.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    const fromId  = ctx.from!.id;
    const chatId  = BigInt(ctx.chat!.id);

    await logMessage(ctx, "in", `[contact: ${contact.phone_number}]`);
    await logAuth(ctx, "contact_shared", { rawPhone: contact.phone_number });

    // Rate limit contact attempts
    if (!(await checkRateLimit(ctx, `contact:${ctx.chat!.id}`, "contact"))) return;

    // ── Rule 1: self-share only ───────────────────────────────────────────
    if (contact.user_id !== undefined && contact.user_id !== null && contact.user_id !== fromId) {
      await logAuth(ctx, "contact_rejected_self");
      await ctx.reply(
        "⚠️ Faqat <b>o'z raqamingizni</b> ulashing — boshqa odamnikini emas.",
        { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // ── Rule 2: must have a phone number ─────────────────────────────────
    if (!contact.phone_number) {
      await logAuth(ctx, "contact_empty_phone");
      await ctx.reply(
        "⚠️ Raqam bo'sh keldi. Telegram profilingizda raqam o'rnatilganmi?\n\n" +
        "Tekshirib qayta urinib ko'ring.",
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // ── Rule 3: E.164 normalization ───────────────────────────────────────
    let phone: string;
    try {
      phone = normalizePhone(contact.phone_number);
    } catch {
      await logAuth(ctx, "contact_invalid_phone", { raw: contact.phone_number });
      await ctx.reply(
        `⚠️ Raqam formati noto'g'ri: <code>${contact.phone_number}</code>\n\n` +
        "Administratoringiz bilan bog'laning.",
        { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // ── Rule 4: look up by canonical E.164 phone ──────────────────────────
    const participant = await prisma.participant.findFirst({
      where:  { phone },
      select: { id: true, fullName: true, isBlocked: true },
    });

    if (!participant) {
      await logAuth(ctx, "not_found", { phone });
      await ctx.reply(
        `❌ <b>Raqam tizimda topilmadi.</b>\n\n` +
        `Administratoringizga quyidagi raqamni yuboring:\n` +
        `📱 <code>${phone}</code>\n\n` +
        `U qo'shgandan so'ng qayta urinib ko'ring.`,
        { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    if (participant.isBlocked) {
      await logAuth(ctx, "blocked_attempt", { phone, participantId: participant.id });
      await ctx.reply(
        "🚫 Bu raqam bloklangan. Administrator bilan bog'laning.",
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // ── Rule 5: duplicate check ───────────────────────────────────────────
    const existingLink = await prisma.telegramLink.findUnique({
      where: { participantId: participant.id },
    });
    if (existingLink && existingLink.chatId !== chatId) {
      await logAuth(ctx, "duplicate_rejected", { phone, participantId: participant.id });
      await ctx.reply(
        "⚠️ Bu raqam boshqa Telegram akkauntiga bog'langan.\n\n" +
        "Eski akkauntda /logout yuboring yoki administratoringiz bilan bog'laning.",
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // ── Rule 6: upsert TelegramLink + update participant ──────────────────
    await prisma.telegramLink.upsert({
      where:  { participantId: participant.id },
      update: {
        chatId,
        username:           ctx.from?.username  ?? null,
        firstName:          ctx.from?.first_name ?? null,
        verifiedPhone:      phone,
        verifiedByContact:  true,
      },
      create: {
        participantId:      participant.id,
        chatId,
        username:           ctx.from?.username  ?? null,
        firstName:          ctx.from?.first_name ?? null,
        verifiedPhone:      phone,
        verifiedByContact:  true,
      },
    });

    await prisma.participant.update({
      where: { id: participant.id },
      data:  { phoneVerifiedAt: new Date(), lastSeenAt: new Date() },
    });

    const isNewLink = !existingLink;
    await logAuth(ctx, isNewLink ? "link_created" : "link_updated", { phone, participantId: participant.id });

    // ── Rule 7: issue portal token ────────────────────────────────────────
    const token     = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.phoneLoginToken.create({
      data: { participantId: participant.id, token, expiresAt },
    });

    const portalUrl = `${APP_URL}/portal/me?token=${token}`;

    await ctx.reply(
      `✅ <b>Tasdiqlandi!</b> Xush kelibsiz, <b>${participant.fullName}</b>!\n\n` +
      `Raqam: <code>${phone}</code>`,
      { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }
    );
    await ctx.reply("👇 Shaxsiy kabinetingiz:", {
      reply_markup: new InlineKeyboard()
        .webApp("🔑 Kabinetni ochish", portalUrl)
        .row()
        .webApp("📊 Natijalarim", `${APP_URL}/portal/me`),
    });

    await logMessage(ctx, "out", `✅ ${participant.fullName} — link ${isNewLink ? "created" : "updated"}, token issued`);
  });

  // ── Callback: homework selected from inline keyboard ──────────────────────
  // ── Callback: delete account confirm/cancel ─────────────────────────────
  b.callbackQuery("confirm_delete", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = BigInt(ctx.chat!.id);
    const link   = await prisma.telegramLink.findFirst({ where: { chatId } });
    if (link) {
      await prisma.telegramLink.delete({ where: { id: link.id } }).catch(() => null);
      await logAuth(ctx, "self_delete");
    }
    await reply(ctx,
      "✅ Telegram akkauntingiz tizimdan uzildi.\n\nMa'lumotlaringiz administratorlar uchun saqlanib qoldi.",
      { reply_markup: { remove_keyboard: true } }
    );
  });

  b.callbackQuery("cancel_delete", async (ctx) => {
    await ctx.answerCallbackQuery();
    await reply(ctx, "❌ Bekor qilindi. Akkauntingiz o'zgarishsiz qoldi.", { reply_markup: linkedKeyboard() });
  });

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

      // Create or reuse submission
      const isNewSub = !existingSub;
      const sub = await prisma.homeworkSubmission.upsert({
        where:  { homeworkId_participantId: { homeworkId: hwId, participantId: link.participantId } },
        update: {},
        create: { homeworkId: hwId, participantId: link.participantId },
      });

      if (isNewSub) {
        void logSubmissionEvent(prisma, {
          submissionId: sub.id,
          actorId:      link.participantId,
          actorRole:    "participant",
          actorName:    link.participant?.fullName ?? "Noma'lum",
          eventType:    SubmissionEventType.SUBMITTED,
        });
      }

      pendingSubmissions.set(chatKey, { homeworkId: hwId, submissionId: sub.id });

    const fileCount  = existingSub?.files.length ?? 0;
    const doneKb     = new InlineKeyboard().text("✅ Yakunlash", "hw_done");

    let prompt = `📎 <b>${hw.title}</b>\n\n`;
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

  // ── Manual-number trap — runs BEFORE main text handler ────────────────────
  // Catches unauthenticated users who TYPE their phone number instead of
  // using the contact-share button. Intercepts the message and prompts them
  // to use the button instead.
  b.on("message:text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return next(); // commands always pass through

    const chatId = BigInt(ctx.chat!.id);
    const linked = await prisma.telegramLink.findFirst({ where: { chatId }, select: { id: true } });
    if (linked) return next(); // authenticated users pass through

    // Looks like a phone number (≥9 consecutive digits)
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 9) {
      await logAuth(ctx, "manual_number_trap", { text });
      const kb = new Keyboard().requestContact("📱 Raqamimni ulashish").resized().oneTime();
      await ctx.reply(
        "⚠️ Raqamni matn sifatida yozib bo'lmaydi — bu xavfsiz emas.\n\n" +
        "Quyidagi tugmani bosing, Telegram raqamingizni avtomatik yuboradi:",
        { reply_markup: kb }
      );
      return; // consumed — don't call next()
    }

    return next();
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

    // Unrecognised
    await reply(ctx,
      "Buyruqlar:\n/login — kabinetga kirish\n/mystatus — statistikam\n/homework — vazifalar",
      { reply_markup: loginKeyboard() }
    );
  });

  // ── File messages (document, audio, video, voice, photo) ────────────────
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
}

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
