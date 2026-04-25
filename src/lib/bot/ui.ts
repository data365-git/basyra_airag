/**
 * Shared UI helpers: keyboard builders, reply wrapper, and message logger.
 */

import { Context, InlineKeyboard, Keyboard } from "grammy";
import prisma from "@/lib/prisma";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://basyra-lmss.up.railway.app").replace(/\/$/, "");

export { APP_URL };

/** Persistent 2×2 reply keyboard — always visible at the bottom */
export const mainKeyboard = new Keyboard()
  .text("📊 Progressim").text("📝 Vazifalarim").row()
  .text("💡 Savol berish")
  .resized()
  .persistent();

/** Keyboard shown AFTER successful linking — opens portal dashboard directly */
export function linkedKeyboard() {
  return new InlineKeyboard().webApp("📊 Shaxsiy kabinetni ochish", `${APP_URL}/portal/me`);
}

/** Keyboard shown to unlinked users — /portal/me handles auth + redirect */
export function loginKeyboard() {
  return new InlineKeyboard().webApp("🌐 Shaxsiy kabinet", `${APP_URL}/portal/me`);
}

// ─── Message logging ──────────────────────────────────────────────────────────

export async function logMessage(ctx: Context, direction: "in" | "out", text?: string, extra?: {
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

export async function reply(ctx: Context, text: string, options?: object): Promise<void> {
  const msg = await ctx.reply(text, { parse_mode: "HTML", ...options });
  await logMessage(ctx, "out", text, { telegramMsgId: msg.message_id });
}
