/**
 * Bot authentication helpers.
 *
 * requireParticipant(ctx) — call at the top of every handler that needs
 * a linked, active participant. Returns the TelegramLink (with participant
 * eager-loaded) or null. Callers must `if (!link) return`.
 *
 * logAuth(ctx, event, meta) — write to BotAuthLog; never throws.
 *
 * Rate-limiting: lightweight in-memory bucket, resets every RATE_WINDOW_MS.
 */

import type { Context } from "grammy";
import { InlineKeyboard, Keyboard } from "grammy";
import prisma from "@/lib/prisma";

// ─── Auth event types ─────────────────────────────────────────────────────────

export type BotAuthEvent =
  | "contact_shared"
  | "contact_rejected_self"       // shared someone else's contact
  | "contact_empty_phone"
  | "contact_invalid_phone"
  | "not_found"                   // phone not in DB
  | "duplicate_rejected"          // phone already linked to different chatId (legacy — no longer emitted)
  | "link_takeover"               // participant link reassigned to a new Telegram account
  | "staff_link_takeover"         // staff link reassigned to a new Telegram account
  | "staff_telegram_reassigned"   // Telegram account moved from one staff user to another
  | "blocked_attempt"
  | "manual_number_trap"          // unauthenticated user typed digits
  | "link_created"
  | "link_updated"
  | "rate_limited"
  | "logout"
  | "self_delete";

// ─── Rate limiter (in-memory) ─────────────────────────────────────────────────

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMITS: Record<string, number> = {
  login:   5,   // /login or /start per hour
  contact: 10,  // contact-share attempts per hour
};

const rateBuckets = new Map<string, { count: number; since: number }>();

/** Returns true if the action is allowed; false (+ side-effect reply) if over limit. */
export async function checkRateLimit(
  ctx:    Context,
  key:    string,  // e.g. "login:12345678" or "contact:12345678"
  bucket: keyof typeof RATE_LIMITS,
): Promise<boolean> {
  const limit = RATE_LIMITS[bucket];
  const now   = Date.now();
  const entry = rateBuckets.get(key);

  if (!entry || now - entry.since > RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, since: now });
    return true;
  }
  if (entry.count >= limit) {
    await logAuth(ctx, "rate_limited", { bucket, key });
    await ctx.reply(
      "⏳ Juda ko'p urinish. 1 soatdan keyin qayta urinib ko'ring.",
      { reply_markup: { remove_keyboard: true } }
    );
    return false;
  }
  entry.count++;
  return true;
}

// ─── Audit logger ─────────────────────────────────────────────────────────────

export async function logAuth(
  ctx:   Context,
  event: BotAuthEvent | string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.botAuthLog.create({
      data: {
        telegramUserId: BigInt(ctx.from?.id ?? 0),
        chatId:         BigInt(ctx.chat?.id  ?? 0),
        phone:          meta?.phone as string | undefined ?? null,
        event,
        meta:           meta ? (meta as object) : undefined,
      },
    });
  } catch {
    // audit log failures are never fatal
  }
}

// ─── Prompt unauthenticated user ──────────────────────────────────────────────

export async function promptLogin(ctx: Context): Promise<void> {
  const kb = new Keyboard()
    .requestContact("📱 Telefon raqamini ulashish")
    .resized()
    .oneTime();
  await ctx.reply(
    "⚠️ Hisobingiz ulanmagan.\n\n" +
    "Davom etish uchun telefon raqamingizni ulashing:",
    { reply_markup: kb }
  );
}

// ─── requireParticipant gate ──────────────────────────────────────────────────

type LinkWithParticipant = NonNullable<Awaited<ReturnType<typeof fetchLink>>>;

async function fetchLink(chatId: bigint) {
  return prisma.telegramLink.findFirst({
    where:   { chatId },
    include: { participant: true },
  });
}

/**
 * Gate for every authenticated handler.
 * Returns the full TelegramLink+Participant row, or null if:
 *   - no link exists → prompts to share phone
 *   - participant is blocked → error message sent
 * Side-effect: touches `lastSeenAt` on success.
 */
export async function requireParticipant(
  ctx: Context,
): Promise<LinkWithParticipant | null> {
  const chatId = BigInt(ctx.chat!.id);
  const link   = await fetchLink(chatId);

  if (!link) {
    await promptLogin(ctx);
    return null;
  }

  if (link.participant.isBlocked) {
    await ctx.reply(
      "🚫 Akkauntingiz bloklangan.\n\nQo'shimcha ma'lumot uchun administratoringiz bilan bog'laning.",
      { reply_markup: { remove_keyboard: true } }
    );
    await logAuth(ctx, "blocked_attempt");
    return null;
  }

  // Touch lastSeenAt — fire-and-forget, don't block the handler
  void prisma.participant.update({
    where: { id: link.participantId },
    data:  { lastSeenAt: new Date() },
  }).catch(() => {});

  return link;
}
