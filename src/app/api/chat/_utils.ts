import type { BotMessage, BotMessageRating, TelegramLink, TelegramMessage, Participant } from "@prisma/client";

export function parseChatId(value: string): bigint | null {
  if (!/^-?\d+$/.test(value)) return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function previewText(value: string | null | undefined, fallback = ""): string {
  const text = (value ?? fallback).replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 157)}...`;
}

export function telegramSource(message: Pick<TelegramMessage, "direction" | "telegramMsgId">) {
  if (message.direction === "in") return "telegram";
  return message.telegramMsgId == null ? "manual" : "admin";
}

export function botSource(message: Pick<BotMessage, "role" | "routedTo">) {
  if (message.role === "user") return "user";
  if (message.routedTo === "templated" || message.routedTo === "template") return "bot_template";
  return "bot_ai";
}

type LinkWithParticipant = TelegramLink & {
  participant: Pick<Participant, "id" | "fullName" | "phone" | "email" | "photoUrl">;
};

export function serializeLink(link: LinkWithParticipant | null | undefined) {
  if (!link) {
    return {
      linked: false,
      label: "Anonymous",
      telegram_link: null,
      participant: null,
    };
  }

  return {
    linked: true,
    label: link.participant.fullName,
    telegram_link: {
      id: link.id,
      chat_id: link.chatId.toString(),
      username: link.username,
      first_name: link.firstName,
      verified_phone: link.verifiedPhone,
      verified_by_contact: link.verifiedByContact,
      linked_at: link.linkedAt.toISOString(),
    },
    participant: {
      id: link.participant.id,
      full_name: link.participant.fullName,
      phone: link.participant.phone,
      email: link.participant.email,
      photo_url: link.participant.photoUrl,
    },
  };
}

export function serializeTelegramMessage(message: TelegramMessage) {
  return {
    id: message.id,
    chat_id: message.chatId.toString(),
    source: telegramSource(message),
    table: "telegram_messages",
    direction: message.direction,
    role: message.direction === "in" ? "user" : "admin",
    text: message.text,
    content: message.text,
    message_type: message.messageType,
    telegram_file_id: message.telegramFileId,
    file_name: message.fileName,
    file_size_bytes: message.fileSizeBytes,
    telegram_msg_id: message.telegramMsgId,
    reply_to_telegram_msg_id: message.replyToTelegramMsgId,
    participant_id: message.participantId,
    created_at: message.createdAt.toISOString(),
  };
}

export function serializeBotMessage(message: BotMessage & { rating: BotMessageRating | null }) {
  return {
    id: message.id,
    chat_id: message.chatId.toString(),
    source: botSource(message),
    table: "bot_messages",
    direction: message.role === "user" ? "in" : "out",
    role: message.role,
    text: message.content,
    content: message.content,
    intent: message.intent,
    routed_to: message.routedTo,
    token_count: message.tokenCount,
    metadata: message.metadata,
    telegram_msg_id: message.telegramMsgId,
    reply_to_telegram_msg_id: message.replyToTelegramMsgId,
    reply_to_message_id: message.replyToMessageId,
    participant_id: message.participantId,
    rating: message.role === "assistant" && message.rating
      ? {
          stars: message.rating.stars,
          reason: message.rating.reason,
          comment: message.rating.comment,
          status: message.rating.status,
          rated_at: message.rating.ratedAt.toISOString(),
        }
      : null,
    created_at: message.createdAt.toISOString(),
  };
}
