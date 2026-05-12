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
  top_timestamp?:   string | null;
  structured_sources?: Array<{
    course: string;
    lesson_number: number | null;
    lesson_title: string | null;
  }> | null;
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
      sources?:             unknown;
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

Course name rules (MUST follow):
- You MUST refer to courses using ONLY these exact canonical names:
  - Business Navigator 2.0
  - Business Navigator 1.0
  - Ideal ROP
- Do NOT abbreviate (not "BN", not "Biznes Nav", not "Navigator"), do NOT translate, do NOT paraphrase.
- If a retrieved chunk uses a different spelling, still use the canonical name in your answer.

Formatting rules:
- Numbered lists MUST start each number on a new line. Never place a number at the end of a paragraph or in the middle of a sentence.
- Use a line break between every list item so each item is clearly separated.
- Do not merge bullet points or numbered items into running prose.

Faithfulness rules:
- Only state facts that are directly supported by the retrieved chunks.
- Do NOT invent numbers, names, analogies, or examples not present in the chunks.
- If a specific example (like a brand name or story) is in a chunk, quote it accurately — do not paraphrase into a different example.
- If chunks on a known course topic (KPIs, sales, team management, telephony, planning tools) are sparse, do NOT say "Bu mavzu materiallarimda yo'q." Instead acknowledge the topic exists in the course and ask the user for a more specific question.
- If the topic is genuinely outside all course material, then say it is not covered.
- Do NOT include inline source citations like (Manba: Course · Dars N) in the body of your answer. The user will tap the sources button to see references.

Named entity precision:
- Abdulboriy aka and Abdulloh aka are DIFFERENT people with different roles in the course. Do not confuse them or merge their content.
- Always use exact names as they appear in the retrieved chunks. Do not substitute or generalize named instructors or figures.

Named instrument rules (RNP):
- When the user asks about RNP (Расчет Недельного Плана / haftaliy reja hisob-kitobi), explain what RNP is as a specific planning instrument — its purpose, structure, and how it is used — based on the retrieved chunks.
- Do NOT give generic sales audit advice as a substitute for a specific named instrument explanation.

Course eligibility rules:
- Do not imply that any job title or profession is disqualified from attending the courses unless the retrieved chunks explicitly state so.
- If eligibility is not mentioned in the chunks, do not speculate about it.

Uzbek language quality rules:
- Do not use double vowels ("oo", "ee", "aa") in Uzbek Latin words unless standard Uzbek orthography requires them.
- Do not mix Russian Cyrillic words into Uzbek Latin text.
- Do not copy verbatim typos or formatting errors from source chunks — correct obvious errors in your output.

Content purity rules:
- Do not include promotional content, advertisement text, or subscription offers in the educational body of your answer.
- If promotional content appears in retrieved chunks, omit it from the answer body — the system will handle it separately.

Contradiction prevention:
- If you have retrieved chunks that answer the question, do NOT also say "Bu haqida materialda ma'lumot topilmadi" or any equivalent phrase in the same response.
- Only say information is missing when you genuinely have no relevant chunks for that specific point.

Closing rule:
- End every response with a short, friendly Uzbek invitation to ask more questions, for example: "Boshqa savollar bo'lsa, bemalol so'rang! 😊"

Repetition rules:
- NEVER repeat the same sentence, paragraph, or bullet point within a single response.
- NEVER append a source citation block if the same citation already appears in the body.
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

/**
 * Remove duplicate paragraphs within a single RAG response.
 * Catches cases where the LLM repeats itself within one reply.
 */
function dedupeResponse(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => {
      if (!p) return false;
      const norm = p.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
      if (norm.length < 8) return true; // keep very short lines (headers, bullets)
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    })
    .join("\n\n");
}

const BANNED_OPENERS = [
  /^xo['']?p,?\s*(qaranglar|tushuntiraman|mana|gap\s+shunda)/i,
  /^mana,?\s*qaranglar/i,
];

function stripBannedOpener(text: string): string {
  for (const pattern of BANNED_OPENERS) {
    if (pattern.test(text.trimStart())) {
      // Drop everything up to and including the first sentence
      const rest = text.replace(/^[^\n.!?]*[.!?]?\s*/u, "");
      return rest.trim() || text;
    }
  }
  return text;
}

// ── Layer 3: output redaction filter ─────────────────────────────────────────

let _redactionTermsCache: Array<{ term: string; replacement: string; case_sensitive: boolean }> = [];
let _redactionCacheTs = 0;
const REDACTION_CACHE_TTL = 60_000; // 1 min

async function loadRedactionTerms(): Promise<typeof _redactionTermsCache> {
  if (Date.now() - _redactionCacheTs < REDACTION_CACHE_TTL) return _redactionTermsCache;
  try {
    const ragBase = process.env.RAG_SERVICE_URL ?? "";
    const token   = process.env.RAG_INTERNAL_TOKEN ?? "";
    const res = await fetch(`${ragBase}/redaction-terms`, {
      headers: { "X-Internal-Token": token },
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      const data = await res.json();
      _redactionTermsCache = (data.terms ?? []) as typeof _redactionTermsCache;
      _redactionCacheTs = Date.now();
    }
  } catch { /* stale cache on error */ }
  return _redactionTermsCache;
}

async function applyRedactionTerms(text: string): Promise<string> {
  const terms = await loadRedactionTerms();
  if (!terms.length) return text;
  let result = text;
  for (const t of terms) {
    try {
      const flags = t.case_sensitive ? "g" : "gi";
      result = result.replace(new RegExp(escapeRegex(t.term), flags), t.replacement);
    } catch { /* skip invalid term */ }
  }
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


const PROMO_PATTERNS = [
  /data365\.uz/i,
  /\b(buyurtma bering|xarid qiling|obuna bo['']ling|hoziroq yoziling)\b/i,
  /\b(kurs narxi|to['']lov narxi|discount|chegirma|maxsus taklif|aksiya)\b/i,
  /\b(reklama|advertisement|promo)\b/i,
];

function movePromotionalToEnd(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const body: string[] = [];
  const promo: string[] = [];

  for (const paragraph of paragraphs) {
    if (PROMO_PATTERNS.some(p => p.test(paragraph))) {
      promo.push(paragraph);
    } else {
      body.push(paragraph);
    }
  }

  if (!promo.length) return text;

  return [
    body.join("\n\n"),
    "─────────────────",
    "🔗 *Reklama:*",
    ...promo,
  ].join("\n\n");
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

    let answer = await applyRedactionTerms(movePromotionalToEnd(stripBannedOpener(dedupeResponse(joinAnswerParts(parts)))));
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

    return { text: answer, raw: combineResponses(responses, answer), metadata };
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
  sources?:      unknown;
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
      sources:       params.sources ?? null,
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
