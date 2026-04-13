/**
 * grammy bot singleton — shared across webhook invocations.
 * Env var:  TELEGRAM_BOT_TOKEN
 */

import { Bot } from "grammy";
import prisma from "@/lib/prisma";
import { getParticipantScorecard } from "@/lib/scorecard";

let bot: Bot | null = null;

export function getBot(): Bot {
  if (bot) return bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  bot = new Bot(token);
  registerHandlers(bot);
  return bot;
}

// ─── Command handlers ─────────────────────────────────────────────────────────

function registerHandlers(b: Bot) {
  // /start [CODE]  — link account or show welcome
  b.command("start", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) {
      await ctx.reply(
        "👋 Assalomu alaykum!\n\n" +
        "Hisobingizni ulash uchun o'qituvchingizdan kod oling va:\n" +
        "<code>/start KOD</code>\n" +
        "deb yuboring.",
        { parse_mode: "HTML" }
      );
      return;
    }

    // Verify code
    const linkCode = await prisma.telegramLinkCode.findUnique({
      where:   { code },
      include: { participant: true },
    });

    if (!linkCode) {
      await ctx.reply("❌ Kod noto'g'ri. O'qituvchingizdan yangi kod so'rang.");
      return;
    }
    if (linkCode.expiresAt < new Date()) {
      await ctx.reply("⏰ Kod muddati o'tgan. O'qituvchingizdan yangi kod so'rang.");
      await prisma.telegramLinkCode.delete({ where: { code } }).catch(() => null);
      return;
    }

    const chatId    = BigInt(ctx.chat.id);
    const firstName = ctx.from?.first_name ?? null;
    const username  = ctx.from?.username  ?? null;

    // Upsert the link
    await prisma.telegramLink.upsert({
      where:  { participantId: linkCode.participantId },
      update: { chatId, username, firstName },
      create: { participantId: linkCode.participantId, chatId, username, firstName },
    });

    // Delete the used code
    await prisma.telegramLinkCode.delete({ where: { code } }).catch(() => null);

    await ctx.reply(
      `✅ Muvaffaqiyatli ulandi!\n\n` +
      `Salom, *${linkCode.participant.fullName}*!\n\n` +
      `📊 Statistikani ko'rish: /mystatus`,
      { parse_mode: "Markdown" }
    );
  });

  // /mystatus — show scorecard for each enrolled training
  b.command("mystatus", async (ctx) => {
    const chatId = BigInt(ctx.chat.id);

    const link = await prisma.telegramLink.findFirst({
      where:   { chatId },
      include: {
        participant: {
          include: { trainingParticipants: { include: { training: true } } },
        },
      },
    });

    if (!link) {
      await ctx.reply(
        "⚠️ Hisobingiz ulanmagan.\n\n" +
        "O'qituvchingizdan kod oling va /start KOD deb yuboring."
      );
      return;
    }

    const { participant } = link;
    const trainings = participant.trainingParticipants.map((tp) => tp.training);

    if (trainings.length === 0) {
      await ctx.reply(`${participant.fullName}, siz hech qanday kursga yozilmagansiz.`);
      return;
    }

    let text = `📊 *${participant.fullName}*\n\n`;

    for (const tr of trainings) {
      const sc = await getParticipantScorecard(participant.id, tr.id);

      const bar = (v: number) => {
        const filled = Math.round(v / 10);
        return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${v}%`;
      };

      text +=
        `📚 *${tr.name}*\n` +
        `Davomat:  ${bar(sc.attendance.rate)}\n` +
        `  ✅ ${sc.attendance.present} keldi · ⏰ ${sc.attendance.late} kech · ❌ ${sc.attendance.absent} kelmadi\n`;

      if (sc.homework.total > 0) {
        text +=
          `Vazifalar: ${sc.homework.submitted}/${sc.homework.total} topshirildi`;
        if (sc.homework.avgScore !== null) {
          text += ` · avg ${sc.homework.avgScore}%`;
        }
        text += "\n";
      }

      text += `⭐ *Umumiy: ${sc.overallScore}%*\n\n`;
    }

    await ctx.reply(text.trim(), { parse_mode: "Markdown" });
  });

  // /homework — list pending homework
  b.command("homework", async (ctx) => {
    const chatId = BigInt(ctx.chat.id);

    const link = await prisma.telegramLink.findFirst({
      where: { chatId },
      include: { participant: { include: { trainingParticipants: true } } },
    });

    if (!link) {
      await ctx.reply("⚠️ Hisobingiz ulanmagan. /start KOD");
      return;
    }

    const trainingIds = link.participant.trainingParticipants.map((tp) => tp.trainingId);
    const homeworks   = await prisma.homework.findMany({
      where:   { trainingId: { in: trainingIds } },
      include: {
        training:    { select: { name: true } },
        submissions: { where: { participantId: link.participantId }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (homeworks.length === 0) {
      await ctx.reply("📭 Hozircha vazifa yo'q.");
      return;
    }

    let text = "📝 *Vazifalar:*\n\n";
    for (const hw of homeworks) {
      const done = hw.submissions.length > 0;
      text +=
        `${done ? "✅" : "⏳"} *${hw.title}*\n` +
        `   📚 ${hw.training.name}\n` +
        (hw.dueDate ? `   📅 Muddat: ${hw.dueDate}\n` : "") +
        `   ${done ? "Topshirildi" : "❗ Topshirilmadi"}\n\n`;
    }
    text += `Javob topshirish uchun: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/me`;

    await ctx.reply(text.trim(), { parse_mode: "Markdown" });
  });

  // Catch-all
  b.on("message", async (ctx) => {
    await ctx.reply(
      "Buyruqlar:\n" +
      "/mystatus — statistikam\n" +
      "/homework — vazifalar\n" +
      "/start KOD — hisobni ulash"
    );
  });
}
