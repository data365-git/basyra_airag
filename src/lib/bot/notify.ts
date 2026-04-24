/**
 * notifyGraded — sends a Telegram message when a homework submission is graded.
 * Called externally from the grade API route.
 */

import prisma from "@/lib/prisma";

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
