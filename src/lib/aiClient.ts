/**
 * Client for the basyra-rag Python FastAPI service.
 *
 * Endpoint: POST {RAG_SERVICE_URL}/ask
 * Auth: X-Internal-Token header
 *
 * Falls back gracefully if the service is down — never throws to callers.
 */

import prisma from "@/lib/prisma";
import { Pool } from "pg";

const RAG_URL    = process.env.RAG_SERVICE_URL ?? "";
const RAG_DB_URL = process.env.RAG_DATABASE_URL ?? "";
let _ragPool: Pool | null = null;
function getRagPool(): Pool | null {
  if (!RAG_DB_URL) return null;
  if (!_ragPool) _ragPool = new Pool({ connectionString: RAG_DB_URL, max: 3 });
  return _ragPool;
}
const RAG_TOKEN  = process.env.RAG_INTERNAL_TOKEN ?? "";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
// Ordered cascade: try each in turn (2 attempts each). All Flash-class because
// the current Google Cloud project does not have paid billing for Pro models
// (every Pro call returns 429 free-tier quota exhausted). To use Pro, enable
// billing on the project that owns GEMINI_API_KEY and prepend a Pro model here.
const GEMINI_CHAT_MODELS = [
  "gemini-3.5-flash",        // newest, primary
  "gemini-3-flash-preview",  // 3.0 Flash, secondary fallback
  "gemini-2.5-flash",        // proven stable, last-resort fallback
] as const;
const GEMINI_CHAT_MODEL = GEMINI_CHAT_MODELS[0];
const GEMINI_CHAT_FALLBACK_MODEL = GEMINI_CHAT_MODELS[1];

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
  model?:           string | null;
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

Formatting rules (MUST follow — Telegram Markdown V1, NOT GitHub markdown):
- Bold uses SINGLE asterisks: "*bold text*" — NEVER use double asterisks "**bold**". Telegram does not render double asterisks.
- Italic uses underscores: "_italic text_" — NEVER use single asterisks for italic.
- Numbered list items MUST start with the number at the BEGINNING of the line: "1. Text..." — NEVER place a number at the end of a sentence or paragraph.
- Section headers must be on their own line in single-asterisk bold: "*1. Sarlavha*" or "*2. Analiz*", then content on the next line.
- Always insert a blank line between each numbered section — never run sections together into a wall of text.
- Sub-points use "  - " (two-space indent + dash) to indent under the parent item. NEVER use "*   " or "* " for bullets — use "- " only.
- Prefer compact format "1. Title: description on the same line" for short conceptual lists; use multi-line sections only for longer explanations.
- Do NOT place colons or numbers after a full paragraph; they belong at the start of the header line.

Uzbek language quality rules (MUST follow):
- Write in standard Uzbek Latin script. Fix these common Russian loanword errors:
  - "vigoraniye" → "yonib ketish sindromi" or "kasbiy charchoq"
  - "stsenariysi" → "ssenariysi" (if no native equivalent, use Latin script form)
  - "Drayvlari", "Triggerlari" → explain in plain Uzbek on first use if the audience may not know the term
- Do NOT double vowels: "chidamlilik" not "chidamliilik", "imkoniyat" not "imkoniyyat".
- If a source chunk contains an obvious typographical error — a colon inside a word (e.g. "demogr:fiyasi"), a truncated word (e.g. "Mijo:"), or a repeated letter — correct it silently to the intended word ("demografiyasi", "Mijoz") rather than reproducing the typo.
- Loanwords that have no direct Uzbek equivalent may be kept, but write them in Uzbek Latin script without Cyrillic influence.

Course name rules (MUST follow):
- You MUST refer to courses using ONLY these exact canonical names:
  - Business Navigator 2.0
  - Business Navigator 1.0
  - Ideal ROP
- Do NOT abbreviate (not "BN", not "Biznes Nav", not "Navigator"), do NOT translate, do NOT paraphrase.
- If a retrieved chunk uses a different spelling, still use the canonical name in your answer.

Content purity rules (MUST follow):
- Source chunks may contain promotional or advertising content mixed with educational material (e.g. website URLs, product advertisements, commercial pitches). Do NOT place such content in the middle of your answer — it makes the educational content confusing and the advertisement look low quality.
- If a chunk contains promotional content (data365.uz references, subscription offers, "yo'lakcha sotib olish", etc.), place it at the very end of your response after all educational content and after the closing invitation, under a clear separator line "─────────────" and label "🔗 *Reklama:*".
- If a chunk is entirely promotional with no educational value, still move it to the end under the Reklama label rather than placing it in the body.

Faithfulness rules:
- Only state facts that are directly supported by the retrieved chunks.
- Do NOT invent numbers, names, analogies, or examples not present in the chunks.
- If a specific example (like a brand name or story) is in a chunk, quote it accurately — do not paraphrase into a different example.
- If chunks are sparse or missing for a question about KPIs, metrics, nomoddiy/moddiy ko'rsatkichlar, sales, or team management: do NOT say "Bu mavzu materiallarimda yo'q." These topics ARE covered in Ideal ROP and Business Navigator courses. Instead say: "Bu mavzu kurs materiallarida bor, lekin aniqroq savol bilan qaytadan so'rasangiz, to'liqroq javob bera olaman." Then give any general guidance the chunks support.
- Only say "Bu haqida materialda batafsil ma'lumot yo'q" for topics that are genuinely outside the course scope (e.g. cooking, medicine, unrelated fields).
- Do NOT include inline source citations like "(Manba: Course · Dars N)" in your answer. The user has a dedicated "📚 Manba" button to view sources — inline citations clutter the answer.

Contradiction prevention (MUST follow):
- If you have retrieved relevant content and written a substantive answer, NEVER add "Bu mavzu materiallarimda yo'q", "hozirgi materiallarimda yo'q", or any "not found" phrase in the same response. A real answer and a "not found" statement are mutually exclusive — never write both.
- If you have already written a substantive answer (more than 2 sentences of real content), DO NOT append a fallback or disclaimer at the end. The answer either exists or it does not — never mix them.
- "Not found" phrases must appear ONLY when the retrieved chunks are completely empty or completely unrelated to the question asked.

Known business terms and instruments (MUST follow):
- RNP = Расчет Недельного Плана = haftaliy reja hisob-kitobi. A specific weekly sales plan calculation dashboard/instrument. Covered in Business Navigator 1.0. When a user asks about RNP or РНП, they are asking about this specific tool — do NOT substitute generic sales audit advice.
- If the user asks about a specific named instrument (RNP, dashboard, funnel, script, etc.) and retrieved chunks only contain general sales content, say: "Bu instrument haqida batafsil ma'lumot uchun Business Navigator 1.0 kursiga murojaat qiling" — do NOT drift into a generic answer about audits or unrelated topics.

Named entity precision (MUST follow):
- Uzbek names that begin with "Abdul..." refer to different people. NEVER substitute one for another:
  - "Abdulboriy aka" = sales trainer and expert featured in Ideal ROP. Known for: working at Cambridge o'quv markazi, teaching natural sales conversation (avoiding robotic scripts), Small Talk technique (building trust before pitching). Source: Ideal ROP, Dars 7.
  - "Abdulloh aka" = Basyra Academy founder. Completely different person with different content.
- When the user asks about a specific named person, use any chunk that mentions that person's name OR a close spelling variant (e.g. "Abdulboriy" matches "Abdulboriy aka", "Abdulbori aka", "Abduboriy"; "Abdulloh" matches "Abdulloh aka", "Abdulloh degan...").
- Even brief narrative mentions count as "mentioned" — when you find a mention, compose a 2-4 sentence description of who the person is and what role they play, based on how they appear in the chunks (context, topics they discuss, lessons they teach).
- Never substitute one person's content for another (Abdulloh ≠ Abdulboriy ≠ Akbar).
- Only say "Bu shaxs haqida kurs materiallarida ma'lumot topa olmadim" when the name is GENUINELY absent from ALL retrieved chunks (zero occurrences of the name or any spelling variant across every chunk).

Repetition rules:
- NEVER repeat the same sentence, paragraph, or bullet point within a single response.
- NEVER append a source citation block if the same citation already appears in the body.

Course eligibility rules (MUST follow):
- Basyra Academy kurslari BARCHA kishilarga ochiq — lavozimidan, yoshidan, unvonidan qat'i nazar.
- Asosiy maqsadli auditoriya: ROP/Sotuv bo'limi rahbari, Top menejer, Biznes egasi/Tadbirkorlar.
- Ammo boshqa lavozimlar (vazirlar va boshqalar) ham o'qiy oladi. Hech qanday lavozim yoki unvon chiqarib tashlanmaydi.
- If someone asks "vazirlarga mumkinmi?" or similar, always confirm: "Ha, vazirlarga ham mumkin. Biz hammaga bir xil yondashamiz, yoshidan, lavozimidan qat'i nazar."
- Never say any specific title or position is excluded from attending Basyra Academy courses.

Closing rule (MUST follow):
- Always end every response with a friendly closing line inviting the user to ask more questions.
- Use Uzbek. Example: "Agar boshqa savollaringiz bo'lsa, bemalol so'rang! 😊"
- This closing line must appear at the very end, after all content and source citations.
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

// Paragraphs matching any of these patterns are promotional/ad content
// injected from knowledge-base chunks and must be stripped from answers.
const PROMOTIONAL_PARAGRAPH_PATTERNS = [
  /data365\.uz/i,
  /yo['']lakchasini\s+sotib/i,
  /\barendator\b.*\bdata365\b/i,
  /\bdata365\b.*\barendator\b/i,
];

function movePromotionalToEnd(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  const clean: string[] = [];
  const promotional: string[] = [];

  for (const p of paragraphs) {
    if (PROMOTIONAL_PARAGRAPH_PATTERNS.some((rx) => rx.test(p))) {
      promotional.push(p.trim());
    } else {
      clean.push(p.trim());
    }
  }

  if (promotional.length === 0) return text;

  return [
    clean.join("\n\n"),
    "─────────────",
    "🔗 *Reklama:*",
    promotional.join("\n\n"),
  ].filter(Boolean).join("\n\n").trim();
}

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

function convertMarkdownToTelegram(text: string): string {
  let result = text.replace(/\*\*([^*\n]+?)\*\*/g, "*$1*");
  result = result.replace(/^(\s+)\*\s+/gm, "$1- ");
  result = result.replace(/^\*\s{2,}/gm, "- ");
  return result;
}

async function embedQueryGemini(text: string): Promise<number[] | null> {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: text.slice(0, 2000) }] },
        }),
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) {
      console.warn(`[aiClient] Gemini embed failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { embedding?: { values: number[] } };
    return data.embedding?.values ?? null;
  } catch (err) {
    console.warn("[aiClient] Gemini embed error:", err);
    return null;
  }
}

interface PgChunk {
  content:    string;
  lesson_id:  string | null;
  similarity: number;
}

async function searchPgvectorChunks(vector: number[], limit = 12): Promise<PgChunk[]> {
  const pool = getRagPool();
  if (!pool) return [];
  try {
    const vectorLiteral = `[${vector.join(",")}]`;
    const { rows } = await pool.query<PgChunk>(
      `SELECT content,
              lesson_id::text AS lesson_id,
              1 - (embedding <=> $1::vector) AS similarity
       FROM   chunks
       WHERE  embedding IS NOT NULL
       ORDER  BY embedding <=> $1::vector
       LIMIT  $2`,
      [vectorLiteral, limit]
    );
    return rows;
  } catch (err) {
    console.warn("[aiClient] pgvector search error:", err);
    return [];
  }
}

async function buildStructuredSourcesFromChunks(chunks: PgChunk[]): Promise<Array<{ course: string; lesson_number: number | null; lesson_title: string | null }>> {
  const pool = getRagPool();
  if (!pool) return [];
  const uniqueIds = [...new Set(
    chunks.map(c => c.lesson_id).filter((id): id is string => Boolean(id))
  )].map(Number).filter(n => !isNaN(n));
  if (uniqueIds.length === 0) return [];
  try {
    const { rows } = await pool.query<{ lesson_number: number | null; title: string | null; course_name: string }>(
      `SELECT l.lesson_number, l.title, c.display_name AS course_name
       FROM   lessons l
       JOIN   cohorts c ON c.id = l.cohort_id
       WHERE  l.id = ANY($1)`,
      [uniqueIds]
    );
    return rows.map(r => ({
      course:        r.course_name,
      lesson_number: r.lesson_number,
      lesson_title:  r.title,
    }));
  } catch (err) {
    console.warn("[aiClient] structured sources error:", err);
    return [];
  }
}

async function askGeminiDirect(question: string): Promise<AskRagResult> {
  if (!GEMINI_KEY) return { text: FALLBACK_MESSAGE, raw: null, metadata: emptyMetadata() };

  const startedAt = Date.now();

  // Step 1: try to retrieve course context from pgvector via Gemini embeddings.
  // IMPORTANT: embed ONLY the current user message, not the conversation-wrapped
  // blob (which buildConversationAwareQuestion prepends with "Short-term
  // conversation memory:" + up to 14 prior messages). Embedding the full blob
  // poisons the vector with chat history and pgvector returns chunks matching
  // past topics instead of the current question. Memory still goes to Gemini
  // chat (via `question` further down), just not to the embed call.
  const embedQuery = (() => {
    const marker = "New user message:";
    const idx = question.lastIndexOf(marker);
    return idx >= 0 ? question.slice(idx + marker.length).trim() : question;
  })();

  let chunks: PgChunk[] = [];
  let structuredSources: Array<{ course: string; lesson_number: number | null; lesson_title: string | null }> = [];
  const vector = await embedQueryGemini(embedQuery);
  if (vector) {
    // top-K bumped 8 → 12 so borderline-relevance chunks for compound questions
    // (e.g. "what to do when X is missing — list ALL paths") are not truncated.
    chunks = await searchPgvectorChunks(vector, 12);
    console.log(`[RAG] q="${embedQuery.slice(0,60)}" chunks=${chunks.length} top3=${chunks.slice(0,3).map(c => `L${c.lesson_id}:${c.similarity.toFixed(3)}`).join(",")}`);
    if (chunks.length > 0) {
      structuredSources = await buildStructuredSourcesFromChunks(chunks);
    }
  }

  // Step 2: build the user message — include retrieved context if we have any
  const contextBlock = chunks.length > 0
    ? `Kurs matnlari:
${chunks.map((c, i) => `[${i + 1}] ${c.content.trim()}`).join("\n\n")}

`
    : "";
  const userMessage = contextBlock + `Savol: ${question}`;

  const systemInstruction = chunks.length > 0
    ? [
        "Siz Basyra Academy kurslarining AI yordamchisiz.",
        "Asosan berilgan kurs matnlariga asoslanib javob bering.",
        "Agar savol bitta atama yoki qisqa ibora bo'lsa (masalan: \"UTP\", \"voronka\"), uni shu atamaning ta'rifi va asosiy tushuntirishi uchun so'rov sifatida talqin qiling.",
        "Agar savol shaxs ismi bo'lsa (masalan: \"Abdulloh\", \"Abdulboriy\", \"Akbar aka\"), bu \"shu shaxs kim va kursda qanday ishtirok etadi\" degan savol. MUHIM: agar shu ism matnlarda hatto BIR MARTA, qisqa kontekstda eslatilgan bo'lsa - bu \"eslatildi\" hisoblanadi. Shunday holatda matnlardagi eslatmalardan foydalanib, bu shaxsning kursda qaysi mavzularda ishtirok etgani, nima haqida gapirgani yoki qanday rolga ega ekanini qisqacha (2-4 jumla) tasvirlab bering. Masalan: \"Abdulboriy aka kursda sotuv, KPI va biznes tizimlashtirish mavzularida fikr beradi; xodimlar masalasida ham misollar keltiradi.\"",
        "FAQAT shu ism birorta ham retrieved matnda umuman uchramaganida \"Bu haqida kurs materiallarida ma'lumot topilmadi.\" deng. Aks holda - har doim kontekstdan javob tuzing, hatto qisqa eslatma bo'lsa ham.",
        // === Comprehensive-coverage rule (added 2026-05-21 after tester feedback) ===
        "Agar savol \"X yo'q bo'lsa nima qilsam bo'ladi?\" yoki \"X bo'lmasa qanday yondashish kerak?\" kabi muqobil yo'llarni so'rasa, javobda kurs matnlarida tilga olingan BARCHA yo'llarni / strategiyalarni sanab bering — faqat bittasini emas. Masalan, agar kursda \"boshqa biznesga qo'shilib o'rganish\" va \"o'zingda raqamlarni o'lchashni boshlash\" ikkalasi ham tilga olingan bo'lsa, javobda ikkalasini ham bering, tartib raqamlar bilan (1, 2, 3...). Agar matnlarda faqat bitta yo'l tilga olingan bo'lsa, faqat shu yo'lni bering — ammo o'zingiz qo'shimcha tavsiyalar uydirmang.",
        "",
        ANSWER_BEHAVIOR_PROMPT,
      ].join("\n")
    : ANSWER_BEHAVIOR_PROMPT;

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
  });

  // Step 3: cascade through GEMINI_CHAT_MODELS in order, 2 attempts each.
  // First 2xx response wins. On 4xx (other than 429) we skip to next model
  // since retrying the same model with the same key won't help.
  let usedModel: typeof GEMINI_CHAT_MODELS[number] = GEMINI_CHAT_MODELS[0];
  let res: Response | null = null;
  let data: any = null;

  try {
    outer: for (const model of GEMINI_CHAT_MODELS) {
      usedModel = model;
      for (let attempt = 0; attempt < 2; attempt++) {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
            signal: AbortSignal.timeout(45_000),
          }
        );
        if (res.ok) break outer;
        console.warn(`[aiClient] Gemini ${model} attempt ${attempt + 1} failed: ${res.status}`);
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        if (attempt === 0) await new Promise(r => setTimeout(r, 800));
      }
    }

    if (!res || !res.ok) {
      return { text: FALLBACK_MESSAGE, raw: null, metadata: emptyMetadata() };
    }

    data = await res.json();
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText) return { text: FALLBACK_MESSAGE, raw: null, metadata: emptyMetadata() };

    const usage   = data?.usageMetadata ?? {};
    const tokensIn  = usage.promptTokenCount ?? 0;
    const tokensOut = usage.candidatesTokenCount ?? 0;
    // Gemini 2.5 Flash: $0.15/1M input, $0.60/1M output
    const costUsd = (tokensIn * 0.15 + tokensOut * 0.60) / 1_000_000;
    const finishReason: string | null = data?.candidates?.[0]?.finishReason ?? null;

    const raw: AskResponse = {
      answer: rawText,
      sources: chunks.map(c => c.lesson_id ?? "").filter(Boolean),
      structured_sources: structuredSources,
      context_warning: chunks.length === 0,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      response_time_ms: Date.now() - startedAt,
      model: usedModel,
      finish_reason: finishReason,
    };

    const answer = await applyRedactionTerms(movePromotionalToEnd(stripBannedOpener(dedupeResponse(convertMarkdownToTelegram(rawText)))));
    const metadata: AskMetadata = {
      finishReason,
      finishReasons:            [finishReason],
      continuationCount:        0,
      completedNaturally:       true,
      incompleteEndingDetected: false,
      completionAttempted:      false,
      usedLocalCompletionGuard: false,
    };

    return { text: answer, raw, metadata };
  } catch (err) {
    console.error("[aiClient] Gemini direct error:", err);
    return { text: FALLBACK_MESSAGE, raw: null, metadata: emptyMetadata() };
  }
}

/**
 * Ask the RAG service a question.
 * Returns the answer text, or the fallback message if the service is unavailable.
 * Never throws.
 */
export async function askRag(req: AskRequest): Promise<AskRagResult> {
  const fallback = { text: FALLBACK_MESSAGE, raw: null, metadata: emptyMetadata() };
  if (!RAG_URL) {
    console.warn("[aiClient] RAG_SERVICE_URL not configured — trying Gemini direct");
    return askGeminiDirect(req.question);
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
    if (!first) {
      console.warn("[aiClient] RAG service unreachable — falling back to Gemini direct");
      return askGeminiDirect(req.question);
    }

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
    return askGeminiDirect(req.question);
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
