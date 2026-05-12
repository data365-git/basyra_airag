import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const BOT_SETTING_KEYS = [
  "bot.cost.daily_limit_usd",
  "bot.cost.monthly_limit_usd",
  "bot.cost.alert_recipient_chat_id",
  "bot.llm.chat_model",
  "bot.long_answer.threshold_chars",
  "bot.tts.model",
  "bot.tts.voice",
  "bot.tts.long_answer_threshold_chars",
  "bot.tts.chunk_size_chars",
  "bot.tts.concurrency",
  "bot.rag.top_k",
  "bot.rag.min_similarity",
  "bot.prompt.system",
  "bot.prompt.admin_instruction",
  "bot.tts_prices_verified",
] as const;

type BotSettingKey = (typeof BOT_SETTING_KEYS)[number];

/** GET /api/chatbot/settings — returns { key: value } for all bot.* keys */
export async function GET() {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "chatbot", "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...BOT_SETTING_KEYS] } },
  });

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }

  return NextResponse.json(result);
}

/** PATCH /api/chatbot/settings — upserts a single setting: body { key, value } */
export async function PATCH(req: NextRequest) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "chatbot", "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { key, value } = body as { key: string; value: string };

  if (!key || !(BOT_SETTING_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  if (value === undefined || value === null) {
    return NextResponse.json({ error: "Value required" }, { status: 400 });
  }

  await prisma.systemSetting.upsert({
    where: { key: key as BotSettingKey },
    update: { value: String(value), updatedBy: user.id },
    create: { key, value: String(value), updatedBy: user.id },
  });

  return NextResponse.json({ success: true });
}
