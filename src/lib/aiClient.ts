/**
 * Client for the basyra-rag Python FastAPI service.
 *
 * Endpoint: POST {RAG_SERVICE_URL}/ask
 * Auth: X-Internal-Token header
 *
 * Falls back gracefully if the service is down — never throws to callers.
 */

import prisma from "@/lib/prisma";

const RAG_URL   = process.env.RAG_SERVICE_URL ?? "";
const RAG_TOKEN = process.env.RAG_INTERNAL_TOKEN ?? "";

export interface AskRequest {
  chat_id:        number;
  participant_id?: string;
  question:       string;
  course_filter?: string;
  answer_behavior_prompt?: string;
  original_question?: string;
}

export interface AskResponse {
  answer:           string;
  sources:          string[];
  context_warning:  boolean;
  tokens_in:        number;
  tokens_out:       number;
  cost_usd:         number;
  response_time_ms: number;
  finish_reason?:   string | null;
  finishReason?:    string | null;
  stop_reason?:     string | null;
  stopReason?:      string | null;
  metadata?:        Record<string, unknown> | null;
}

const FALLBACK_MESSAGE =
  "AI yordamchim hozir band. Savolingizni murabbiyga yetkazaman 🙏";
const MAX_CONTINUATIONS = 4;
const RAG_TIMEOUT_MS = 15_000;

export interface AskMetadata {
  finishReason:             string | null;
  finishReasons:            Array<string | null>;
  continuationCount:        number;
  completedNaturally:       boolean;
  incompleteEndingDetected: boolean;
  completionAttempted:      boolean;
  usedLocalCompletionGuard: boolean;
}

export interface AskRagResult {
  text:     string;
  raw:      AskResponse | null;
  metadata: AskMetadata;
}

type BotUsageLogDelegate = {
  create(args: {
    data: {
      messageId:      string | null;
      participantId:  string | null;
      chatId:         bigint;
      model:          string;
      kind:           "chat" | "tts" | "embed";
      tokensIn:       number;
      tokensOut:      number;
      costUsd:        number;
      responseTimeMs: number;
    };
  }): Promise<unknown>;
};

type BotMessageDelegate = {
  create(args: {
    data: {
      chatId:               bigint;
      participantId:        string | null;
      role:                 "user" | "assistant";
      content:              string;
      intent:               string | null;
      routedTo:             string | null;
      tokenCount:           number | null;
      metadata?:            Record<string, unknown> | null;
      telegramMsgId?:       number | null;
      replyToTelegramMsgId?: number | null;
      replyToMessageId?:    string | null;
    };
  }): Promise<{ id: string }>;
};

const ANSWER_BEHAVIOR_PROMPT = `
AI Conversation Reliability / Answer Behavior:
- Direct answer first. Start with the answer, checklist, KPI list, audit table, or requested structure. Do not open by retelling course stories.
- These rules are higher priority than course voice, lesson-story, and style rules. Keep the course voice only after the answer is structurally correct.
- Treat retrieved course chunks as evidence and context, not as the required answer structure.
- For list, checklist, KPI, metric, audit, comparison, or "what should we check/measure" questions, answer in that requested structure.
- For multi-system questions, create a separate section for every mentioned system, for example LMS, CRM, and telephony/calls. Do not merge them into one generic story.
- Use stories only when the user asks for explanation, examples, lesson summary, or "tushuntirib bering".
- If the source chunks are narrative but the user asked for an audit/checklist/metrics answer, extract actionable criteria from the chunks and present them as a practical answer.
- Be honest about missing evidence. If one mentioned system is not covered by the chunks, still keep its section and say what is missing before giving general guidance.

Uzbek Language Quality:
- Write clean Uzbek Latin script. Do not double vowels (write "sifat", not "siifat"). Do not mix Russian loanwords in Cyrillic into a Latin-script answer. Do not copy verbatim typos or broken spellings from source chunks.

Content Purity:
- Do not embed promotional content (data365.uz ads, subscription pitches, enrollment CTAs) inside the educational answer body. If promotional content appears in retrieved chunks, it must not appear in the main answer at all.

Contradiction Prevention:
- Never say "Bu mavzu haqida ma'lumot topilmadi" or any equivalent ("I don't have information on this", "materiallarimda yo'q") in the same response where you are actually providing substantive content on that topic. If you have an answer, give it directly. Only state that information is missing when you genuinely cannot provide any relevant content.

Named Instruments — RNP and others:
- RNP is a specific sales management tool taught in this course (Расчет Недельного Плана — haftaliy sotuv rejasi hisob-kitobi). When a user asks about RNP, explain what it is and how it is used in the sales/team management context. Do not treat it as an unknown abbreviation or return generic sales audit advice.

Named Entity Precision:
- "Abdulboriy aka" and "Abdulloh aka" are different instructors covering different parts of the course material. Never attribute content from one to the other.

Course Eligibility:
- Do not imply that any job title, seniority level, or role disqualifies a person from attending or benefiting from the course. All enrolled participants are eligible.

Citations:
- Do not include inline source citations such as "(Manba: Course · Dars N)" in the answer body. The user can access sources via the dedicated button.

Sparse Chunks on Known Topics:
- If retrieved chunks are sparse but the question concerns a topic known to be in the course curriculum (KPIs, sales metrics, team management, RNP, CRM, telephony/calls), do not say the information is missing. Instead, acknowledge that the topic is covered in the course and ask the user to specify which aspect they want to know more about.

Closing:
- End every response with a short, friendly Uzbek sentence inviting the user to ask follow-up questions. Example: "Yana savollaringiz bo'lsa, bemalol so'rang! 😊"
`.trim();

// ── Budget enforcement ────────────────────────────────────────────────
let _budgetCache: { daily: number; monthly: number; ts: number } | null = null;

async function getCurrentSpend(): Promise<{ daily: number; monthly: number }> {
  const now = Date.now();
  if (_budgetCache && now - _budgetCache.ts < 30_000) {
    return { daily: _budgetCache.daily, monthly: _budgetCache.monthly };
  }
  const tz = "Asia/Tashkent";
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const monthStr = todayStr.slice(0, 7); // "YYYY-MM"
  const [daily, monthly] = await Promise.all([
    (prisma as any).botUsageLog?.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: new Date(`${todayStr}T00:00:00+05:00`) } },
    }),
    (prisma as any).botUsageLog?.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: new Date(`${monthStr}-01T00:00:00+05:00`) } },
    }),
  ]);
  const d = Number(daily?._sum?.costUsd ?? 0);
  const m = Number(monthly?._sum?.costUsd ?? 0);
  _budgetCache = { daily: d, monthly: m, ts: now };
  return { daily: d, monthly: m };
}

async function getUserSpend(participantId: string): Promise<{ daily: number; monthly: number }> {
  const tz = "Asia/Tashkent";
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const monthStr = todayStr.slice(0, 7);
  const [daily, monthly] = await Promise.all([
    (prisma as any).botUsageLog?.aggregate({
      _sum: { costUsd: true },
      where: { participantId, createdAt: { gte: new Date(`${todayStr}T00:00:00+05:00`) } },
    }),
    (prisma as any).botUsageLog?.aggregate({
      _sum: { costUsd: true },
      where: { participantId, createdAt: { gte: new Date(`${monthStr}-01T00:00:00+05:00`) } },
    }),
  ]);
  return { daily: Number(daily?._sum?.costUsd ?? 0), monthly: Number(monthly?._sum?.costUsd ?? 0) };
}

async function getCaps(): Promise<{
  dailyCap: number; monthlyCap: number;
  perUserDailyCap: number; perUserMonthlyCap: number;
  mode: string;
}> {
  const keys = [
    "chatbot.daily_cost_cap_usd",
    "chatbot.monthly_cost_cap_usd",
    "chatbot.per_user_daily_cap_usd",
    "chatbot.per_user_monthly_cap_usd",
    "chatbot.enforce_caps_mode",
  ];
  const rows = await (prisma as any).systemSetting?.findMany({ where: { key: { in: keys } } }) ?? [];
  const get = (k: string, def: number) => {
    const r = rows.find((r: { key: string; value: string }) => r.key === k);
    return r ? parseFloat(r.value) || def : def;
  };
  const getStr = (k: string, def: string) =>
    rows.find((r: { key: string; value: string }) => r.key === k)?.value ?? def;
  return {
    dailyCap:          get("chatbot.daily_cost_cap_usd", 5),
    monthlyCap:        get("chatbot.monthly_cost_cap_usd", 100),
    perUserDailyCap:   get("chatbot.per_user_daily_cap_usd", 0.20),
    perUserMonthlyCap: get("chatbot.per_user_monthly_cap_usd", 5),
    mode:              getStr("chatbot.enforce_caps_mode", "block"),
  };
}

export async function checkBudget(participantId?: string | null): Promise<string | null> {
  try {
    const [spend, caps] = await Promise.all([getCurrentSpend(), getCaps()]);
    if (caps.mode !== "block") return null;
    if (spend.monthly >= caps.monthlyCap) {
      return "⚠️ Bot bu oy uchun belgilangan limitga yetdi. Iltimos, keyingi oy yana urinib ko'ring.";
    }
    if (spend.daily >= caps.dailyCap) {
      return "⚠️ Bot bugungi limitga yetdi. Ertaga qaytadan urinib ko'ring.";
    }
    if (participantId) {
      const userSpend = await getUserSpend(participantId);
      const { perUserDailyCap, perUserMonthlyCap } = caps;
      if (userSpend.monthly >= perUserMonthlyCap) {
        return "⚠️ Sizning oylik AI limitingiz tugadi. Keyingi oy yana foydalanishingiz mumkin.";
      }
      if (userSpend.daily >= perUserDailyCap) {
        return "⚠️ Sizning kunlik AI limitingiz tugadi. Ertaga qaytadan urinib ko'ring.";
      }
    }
    return null; // all good
  } catch {
    return null; // budget check failure must not block the user
  }
}

// Alert thresholds — fire once per threshold crossing per month
async function checkAndFireAlerts(): Promise<void> {
  try {
    const [spend, caps] = await Promise.all([getCurrentSpend(), getCaps()]);
    if (caps.monthlyCap <= 0) return;
    const pct = Math.floor((spend.monthly / caps.monthlyCap) * 100);
    const lastRow = await (prisma as any).systemSetting?.findUnique({ where: { key: "chatbot.last_alert_threshold_pct" } });
    const lastPct = parseInt(lastRow?.value ?? "0", 10);
    for (const threshold of [50, 80, 100]) {
      if (pct >= threshold && lastPct < threshold) {
        await (prisma as any).systemSetting?.upsert({
          where: { key: "chatbot.last_alert_threshold_pct" },
          update: { value: String(threshold) },
          create: { key: "chatbot.last_alert_threshold_pct", value: String(threshold) },
        });
        console.warn(`[BUDGET] Alert: ${threshold}% of monthly budget reached ($${spend.monthly.toFixed(4)} / $${caps.monthlyCap})`);
        // TODO: send Telegram DM to bot admins
        break;
      }
    }
  } catch {
    // alerts must never throw
  }
}
// ─────────────────────────────────────────────────────────────────────

const PROMO_PATTERNS = [
  /data365\.uz/i,
  /obuna\s*(bo[''`]?ling|oling|qiling)/i,
  /kursga\s*yoziling/i,
  /biz\s*bilan\s*(bo[''`]?ling|ishla)/i,
  /\bhavola\b.*\bhttps?:\/\//i,
];

function movePromotionalToEnd(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const body: string[] = [];
  const promo: string[] = [];

  for (const para of paragraphs) {
    if (PROMO_PATTERNS.some(p => p.test(para))) {
      promo.push(para);
    } else {
      body.push(para);
    }
  }

  if (!promo.length) return text;

  return [
    body.join("\n\n"),
    "",
    "─────────────────",
    "🔗 *Reklama:*",
    promo.join("\n\n"),
  ].join("\n");
}

function buildRagQuestion(question: string): string {
  const trimmed = question.trim();

  return [
    trimmed,
    "",
    "--- ANSWER BEHAVIOR OVERRIDE ---",
    ANSWER_BEHAVIOR_PROMPT,
  ].join("\n");
}

function emptyMetadata(): AskMetadata {
  return {
    finishReason:             null,
    finishReasons:            [],
    continuationCount:        0,
    completedNaturally:       false,
    incompleteEndingDetected: false,
    completionAttempted:      false,
    usedLocalCompletionGuard: false,
  };
}

async function postAsk(req: AskRequest): Promise<AskResponse | null> {
  const res = await fetch(`${RAG_URL}/ask`, {
    method:  "POST",
    headers: {
      "Content-Type":    "application/json",
      "X-Internal-Token": RAG_TOKEN,
    },
    body:    JSON.stringify(req),
    cache:   "no-store",
    signal:  AbortSignal.timeout(RAG_TIMEOUT_MS),
  });

  if (!res.ok) {
    console.warn(`[aiClient] RAG service returned ${res.status}`);
    return null;
  }

  return await res.json() as AskResponse;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function findStringByKeys(value: unknown, keys: Set<string>, depth = 0): string | null {
  if (depth > 4) return null;
  const record = asRecord(value);
  if (!record) return null;

  for (const [key, entry] of Object.entries(record)) {
    if (keys.has(key) && typeof entry === "string") return entry;
  }

  for (const entry of Object.values(record)) {
    if (Array.isArray(entry)) {
      for (const item of entry) {
        const found = findStringByKeys(item, keys, depth + 1);
        if (found) return found;
      }
    } else {
      const found = findStringByKeys(entry, keys, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function extractFinishReason(data: AskResponse | null): string | null {
  if (!data) return null;
  return findStringByKeys(
    data,
    new Set(["finish_reason", "finishReason", "stop_reason", "stopReason", "finishReasonCode"]),
  );
}

function isLengthFinishReason(reason: string | null): boolean {
  if (!reason) return false;
  const normalized = reason.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return [
    "length",
    "max_tokens",
    "max_output_tokens",
    "token_limit",
    "output_token_limit",
    "max_length",
    "truncated",
    "incomplete",
  ].some((marker) => normalized.includes(marker));
}

function buildContinuationQuestion(originalQuestion: string, answerSoFar: string): string {
  return [
    "The previous answer was cut off because of an output length limit.",
    "Continue the same answer in the same language and style.",
    "Return only the missing continuation. Do not repeat paragraphs already written.",
    "",
    "Original question:",
    originalQuestion,
    "",
    "Answer so far:",
    answerSoFar,
  ].join("\n");
}

function buildFinalSentenceCompletionQuestion(originalQuestion: string, answerSoFar: string): string {
  return [
    "The answer below appears to stop mid-sentence.",
    "Complete only the unfinished final sentence in the same language.",
    "Return only the missing words or phrase. Do not repeat the full answer.",
    "",
    "Original question:",
    originalQuestion,
    "",
    "Answer so far:",
    answerSoFar,
  ].join("\n");
}

function normalizeParagraph(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removePrefixOverlap(previous: string, next: string): string {
  const prev = previous.trimEnd();
  const candidate = next.trimStart();
  const max = Math.min(prev.length, candidate.length, 1200);

  for (let size = max; size >= 40; size -= 1) {
    if (prev.slice(-size) === candidate.slice(0, size)) {
      return candidate.slice(size).trimStart();
    }
  }

  return candidate;
}

function joinAnswerParts(parts: string[]): string {
  let joined = "";
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const next = joined ? removePrefixOverlap(joined, trimmed) : trimmed;
    if (!next) continue;
    joined = joined ? `${joined}\n\n${next}` : next;
  }

  const seen = new Set<string>();
  return joined
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => {
      const normalized = normalizeParagraph(paragraph);
      if (!normalized) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join("\n\n");
}

function appendFinalSentenceCompletion(answer: string, completion: string): string {
  const suffix = removePrefixOverlap(answer, completion).trim();
  if (!suffix) return answer;
  if (/^[,.;:!?)]/.test(suffix)) return `${answer.trimEnd()}${suffix}`;
  return `${answer.trimEnd()} ${suffix}`;
}

function appearsIncompleteEnding(answer: string): boolean {
  const text = answer.trim();
  if (text.length < 80) return false;
  if (/```[^`]*$/.test(text)) return true;
  if (/[.!?)]["')\]]?$/.test(text)) return false;
  if (/:$/.test(text)) return false;
  if (/\.\.\.$/.test(text)) return true;

  const lastLine = text.split(/\n/).pop()?.trim() ?? "";
  if (/^[-*0-9.]+\s+\S+/.test(lastLine) && lastLine.length < 90) return false;

  const lastWord = lastLine.split(/\s+/).pop()?.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") ?? "";
  return [
    "and",
    "or",
    "but",
    "because",
    "if",
    "with",
    "without",
    "for",
    "to",
    "va",
    "yoki",
    "lekin",
    "agar",
    "bilan",
    "uchun",
  ].includes(lastWord) || lastLine.length > 140;
}

function combineResponses(responses: AskResponse[], answer: string): AskResponse {
  const first = responses[0];
  const sources = Array.from(new Set(responses.flatMap((item) => item.sources ?? [])));
  return {
    ...first,
    answer,
    sources,
    context_warning:  responses.some((item) => item.context_warning),
    tokens_in:        responses.reduce((sum, item) => sum + (item.tokens_in ?? 0), 0),
    tokens_out:       responses.reduce((sum, item) => sum + (item.tokens_out ?? 0), 0),
    cost_usd:         responses.reduce((sum, item) => sum + (item.cost_usd ?? 0), 0),
    response_time_ms: responses.reduce((sum, item) => sum + (item.response_time_ms ?? 0), 0),
    finish_reason:    extractFinishReason(responses[responses.length - 1]),
  };
}

/**
 * Ask the RAG service a question.
 * Returns the answer text, or the fallback message if the service is unavailable.
 * Never throws.
 */
export async function askRag(req: AskRequest): Promise<AskRagResult> {
  const fallback = { text: FALLBACK_MESSAGE, raw: null, metadata: emptyMetadata() };
  if (!RAG_URL) {
    console.warn("[aiClient] RAG_SERVICE_URL not configured");
    return fallback;
  }

  const originalQuestion = req.original_question ?? req.question;
  const requestBody: AskRequest = {
    ...req,
    question: buildRagQuestion(req.question),
    original_question: originalQuestion,
    answer_behavior_prompt: req.answer_behavior_prompt ?? ANSWER_BEHAVIOR_PROMPT,
  };

  try {
    const first = await postAsk(requestBody);
    if (!first) return fallback;

    const responses = [first];
    const parts = [first.answer];
    const finishReasons: Array<string | null> = [extractFinishReason(first)];

    for (let i = 0; i < MAX_CONTINUATIONS && isLengthFinishReason(finishReasons[finishReasons.length - 1]); i += 1) {
      const answerSoFar = joinAnswerParts(parts);
      const continuation = await postAsk({
        ...requestBody,
        question: buildRagQuestion(buildContinuationQuestion(originalQuestion, answerSoFar)),
      });
      if (!continuation) break;
      responses.push(continuation);
      parts.push(continuation.answer);
      finishReasons.push(extractFinishReason(continuation));
    }

    let answer = joinAnswerParts(parts);
    let incompleteEndingDetected = appearsIncompleteEnding(answer);
    let completionAttempted = false;

    if (incompleteEndingDetected && !isLengthFinishReason(finishReasons[finishReasons.length - 1])) {
      completionAttempted = true;
      const completion = await postAsk({
        ...requestBody,
        question: buildRagQuestion(buildFinalSentenceCompletionQuestion(originalQuestion, answer)),
      });
      if (completion?.answer) {
        responses.push(completion);
        finishReasons.push(extractFinishReason(completion));
        answer = appendFinalSentenceCompletion(answer, completion.answer);
        incompleteEndingDetected = appearsIncompleteEnding(answer);
      }
    }

    const lastFinishReason = finishReasons[finishReasons.length - 1] ?? null;
    const metadata: AskMetadata = {
      finishReason:             lastFinishReason,
      finishReasons,
      continuationCount:        Math.max(0, responses.length - 1 - (completionAttempted ? 1 : 0)),
      completedNaturally:       !isLengthFinishReason(lastFinishReason) && !incompleteEndingDetected,
      incompleteEndingDetected,
      completionAttempted,
      usedLocalCompletionGuard:  completionAttempted,
    };

    const finalAnswer = movePromotionalToEnd(answer);
    return { text: finalAnswer, raw: combineResponses(responses, finalAnswer), metadata };
  } catch (err) {
    console.error("[aiClient] RAG service error:", err);
    return fallback;
  }
}

/**
 * Write a BotUsageLog row. Fire-and-forget — never blocks.
 */
export async function logUsage(params: {
  messageId?:     string | null;
  participantId?: string | null;
  chatId:         bigint;
  model:          string;
  kind:           "chat" | "tts" | "embed";
  tokensIn?:      number;
  tokensOut?:     number;
  costUsd?:       number;
  responseTimeMs?: number;
}): Promise<void> {
  try {
    const { default: prisma } = await import("@/lib/prisma");
    const client = prisma as unknown as { botUsageLog?: BotUsageLogDelegate };
    await client.botUsageLog?.create({ data: {
      messageId:      params.messageId ?? null,
      participantId:  params.participantId ?? null,
      chatId:         params.chatId,
      model:          params.model,
      kind:           params.kind,
      tokensIn:       params.tokensIn ?? 0,
      tokensOut:      params.tokensOut ?? 0,
      costUsd:        params.costUsd ?? 0,
      responseTimeMs: params.responseTimeMs ?? 0,
    }});
    void checkAndFireAlerts();
  } catch {
    // non-critical — never throw
  }
}

/**
 * Log a bot message to the BotMessage table.
 * Fire-and-forget — never blocks the bot response.
 */
export async function logBotMessage(params: {
  chatId:        bigint;
  participantId?: string;
  role:          "user" | "assistant";
  content:       string;
  intent?:       string;
  routedTo?:     string;
  tokenCount?:   number;
  metadata?:     Record<string, unknown> | null;
  telegramMsgId?: number | null;
  replyToTelegramMsgId?: number | null;
  replyToMessageId?: string | null;
}): Promise<string | null> {
  try {
    const { default: prisma } = await import("@/lib/prisma");
    const client = prisma as unknown as { botMessage: BotMessageDelegate };
    const msg = await client.botMessage.create({ data: {
      chatId:        params.chatId,
      participantId: params.participantId ?? null,
      role:          params.role,
      content:       params.content,
      intent:        params.intent ?? null,
      routedTo:      params.routedTo ?? null,
      tokenCount:    params.tokenCount ?? null,
      metadata:      params.metadata ?? null,
      telegramMsgId: params.telegramMsgId ?? null,
      replyToTelegramMsgId: params.replyToTelegramMsgId ?? null,
      replyToMessageId: params.replyToMessageId ?? null,
    }});
    return msg.id;
  } catch {
    try {
      const { default: prisma } = await import("@/lib/prisma");
      const client = prisma as unknown as { botMessage: BotMessageDelegate };
      const msg = await client.botMessage.create({ data: {
        chatId:        params.chatId,
        participantId: params.participantId ?? null,
        role:          params.role,
        content:       params.content,
        intent:        params.intent ?? null,
        routedTo:      params.routedTo ?? null,
        tokenCount:    params.tokenCount ?? null,
      }});
      return msg.id;
    } catch (fallbackErr) {
      console.error("[aiClient] logBotMessage failed:", fallbackErr);
    }
    return null;
  }
}
