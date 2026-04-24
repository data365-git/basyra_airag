/**
 * grammy bot — thin orchestrator.
 * Env:  TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_APP_URL
 *
 * Handler logic lives in src/lib/bot/:
 *   ui.ts          — keyboard builders, reply helper, message logger
 *   state.ts       — in-memory per-chat submission/file state
 *   contactAuth.ts — /start, /login, /logout, /privacy, /delete, message:contact
 *   handlers.ts    — /mystatus, /debug, /cancel, /homework, callbacks, file messages
 *   notify.ts      — notifyGraded (called externally from grade API route)
 */

import { Bot } from "grammy";
import { registerContactAuthHandlers } from "./bot/contactAuth";
import { registerCommandHandlers }     from "./bot/handlers";

export { notifyGraded } from "./bot/notify";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://basyra-lmss.up.railway.app").replace(/\/$/, "");

let bot: Bot | null = null;

export function getBot(): Bot {
  if (bot) return bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  bot = new Bot(token);

  registerContactAuthHandlers(bot);
  registerCommandHandlers(bot);

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
