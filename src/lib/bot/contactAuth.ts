/**
 * Contact / phone authentication handlers.
 *
 * Covers:
 *  - /start (with and without a link code)
 *  - /login
 *  - /logout
 *  - /privacy
 *  - /delete + confirm_delete / cancel_delete callbacks
 *  - message:contact (phone-number receipt + DB linking)
 *  - Manual-number text trap (unauthenticated users typing a phone number)
 */

import { randomUUID }  from "crypto";
import { Bot, Keyboard, InlineKeyboard } from "grammy";
import prisma from "@/lib/prisma";
import { requireParticipant, logAuth, checkRateLimit, promptLogin } from "@/lib/botAuth";
import { normalizePhone } from "@/lib/phone";
import { APP_URL, linkedKeyboard, mainKeyboard, logMessage, reply } from "./ui";

export function registerContactAuthHandlers(b: Bot) {

  // ── /start [CODE] ─────────────────────────────────────────────────────────
  b.command("start", async (ctx) => {
    await logMessage(ctx, "in", ctx.message?.text);
    const code = ctx.match?.trim();

    if (!code) {
      const chatId = BigInt(ctx.chat!.id);
      // Check rate limit before showing keyboard
      const rlKey = `login:${ctx.chat!.id}`;
      if (!(await checkRateLimit(ctx, rlKey, "login"))) return;

      // If already linked, show home menu with inline buttons + persistent keyboard
      const existing = await prisma.telegramLink.findFirst({
        where:   { chatId },
        include: { participant: { select: { fullName: true } } },
      });
      if (existing) {
        const homeMenu = new InlineKeyboard()
          .text("📊 Mening progressim", "menu_status").row()
          .text("📝 Uy vazifam",        "menu_homework").row()
          .text("💡 Savol berish",      "menu_ai");
        await reply(ctx,
          `Salom, <b>${existing.participant.fullName}</b>! 👋\n\nBugun nima qilamiz?\n\n<i>Yoki shunchaki yozing — men tushunaman</i> 🤖`,
          { reply_markup: homeMenu }
        );
        // Send the persistent keyboard as a separate message so it attaches correctly
        await ctx.reply("👇", { reply_markup: mainKeyboard });
        return;
      }

      // Not linked — show login button
      const loginMenu = new InlineKeyboard()
        .text("📲 Hisobga kirish", "auth_login");
      await reply(ctx,
        "Salom! Men <b>Basyra</b> AI yordamchisiman.\n\nKurslaringiz va vazifalaringizni ko'rish uchun telefon raqamingizni ulang.\n\n<i>Savol berishingiz mumkin — ro'yxatdan o'tmagan holda ham!</i>",
        { reply_markup: loginMenu }
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

  // ── /login — phone number authentication ──────────────────────────────────
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

  // ── /logout — unlink Telegram (keeps participant record) ──────────────────
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

  // ── /privacy ───────────────────────────────────────────────────────────────
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

  // ── /delete — self-service account deletion ────────────────────────────────
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

  // ── Callbacks: delete account confirm / cancel ─────────────────────────────
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

  // ── Contact message — phone number received ────────────────────────────────
  b.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    const fromId  = ctx.from!.id;
    const chatId  = BigInt(ctx.chat!.id);

    await logMessage(ctx, "in", `[contact: ${contact.phone_number}]`);
    await logAuth(ctx, "contact_shared", { rawPhone: contact.phone_number });

    // Rate limit contact attempts
    if (!(await checkRateLimit(ctx, `contact:${ctx.chat!.id}`, "contact"))) return;

    // ── Rule 1: self-share only ─────────────────────────────────────────────
    if (contact.user_id !== undefined && contact.user_id !== null && contact.user_id !== fromId) {
      await logAuth(ctx, "contact_rejected_self");
      await ctx.reply(
        "⚠️ Faqat <b>o'z raqamingizni</b> ulashing — boshqa odamnikini emas.",
        { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // ── Rule 2: must have a phone number ────────────────────────────────────
    if (!contact.phone_number) {
      await logAuth(ctx, "contact_empty_phone");
      await ctx.reply(
        "⚠️ Raqam bo'sh keldi. Telegram profilingizda raqam o'rnatilganmi?\n\n" +
        "Tekshirib qayta urinib ko'ring.",
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // ── Rule 3: E.164 normalization ─────────────────────────────────────────
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

    // ── Rule 4: look up by canonical E.164 phone ─────────────────────────────
    // Step 1 — fast exact match
    let participant = await prisma.participant.findFirst({
      where:  { phone },
      select: { id: true, fullName: true, isBlocked: true },
    });

    // Step 2 — fuzzy fallback: digits-only comparison (handles DB phones stored
    // without "+", with spaces, local "0…" format, etc.). Self-heals on match
    // by writing the canonical E.164 back to DB so next lookup is fast.
    if (!participant) {
      const digitsOnly = phone.replace(/\D/g, ""); // e.g. "998901234567"
      const candidates = await prisma.participant.findMany({
        where:  { phone: { not: null } },
        select: { id: true, fullName: true, isBlocked: true, phone: true },
      });
      const match = candidates.find(
        (p) => p.phone!.replace(/\D/g, "") === digitsOnly,
      ) ?? null;
      if (match) {
        participant = match;
        // Self-heal: normalise the stored phone to canonical E.164 so future
        // exact-match queries succeed. Non-critical — never block auth on this.
        await prisma.participant.update({
          where: { id: match.id },
          data:  { phone },
        }).catch(() => null);
      }
    }

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

    // ── Rule 5: duplicate check ─────────────────────────────────────────────
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

    // ── Rule 6: upsert TelegramLink + update participant ───────────────────
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

    // ── Rule 7: issue portal token ──────────────────────────────────────────
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
}
