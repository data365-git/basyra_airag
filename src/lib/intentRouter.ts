/**
 * 3-layer intent router for the unified Basyra bot.
 *
 * Layer 1: Hard signals (commands → "command")
 * Layer 2: Keyword/regex table → business, LMS, feedback intents
 * Layer 3: Gemini Flash classifier (cached)
 *
 * Returns one of:
 *   "command"            — already handled by a registered command handler
 *   "LMS_SCHEDULE"       — "when is my class", jadval queries
 *   "LMS_HOMEWORK"       — homework status / submission queries
 *   "LMS_GRADE"          — grade / score queries
 *   "LMS_ATTENDANCE"     — attendance queries
 *   "LMS_OTHER"          — other LMS questions (handled by LMS fallback)
 *   "AI_COURSE_QUESTION" — forward to RAG service
 *   "BUSINESS_CONSULTING" — business/system consulting questions → RAG service
 *   "SMALL_TALK"         — greeting, off-topic → templated reply
 *   "UNCLEAR"            — couldn't classify → show quick-action buttons
 */

export type Intent =
  | "command"
  | "LMS_SCHEDULE"
  | "LMS_HOMEWORK"
  | "LMS_GRADE"
  | "LMS_ATTENDANCE"
  | "LMS_OTHER"
  | "AI_COURSE_QUESTION"
  | "BUSINESS_CONSULTING"
  | "SMALL_TALK"
  | "COMPLAINT"
  | "SUGGESTION"
  | "PRAISE"
  | "UNCLEAR";

// ── Layer 2: keyword table ────────────────────────────────────────────────────

const KEYWORD_RULES: Array<{ intent: Intent; patterns: RegExp[] }> = [
  {
    intent: "BUSINESS_CONSULTING",
    patterns: [
      /\b(crm|bi|dashboard|dashbord|telephony|telefoniya|telefonia|call center|sales funnel|voronka|integratsiya|integration|integrations)\b/i,
      /\b(audit|аудит|checklist|check-list|tekshiruv|tekshirish|konsalting|consulting|biznes konsult|business consult|biznes jarayon|business process|process analysis|kpi|КПИ|metrics?|metrika|ko'rsatkich|кўрсаткич|indikator|analitika|analytics|nomoddiy|номоддий|moddiy|моддий)\b/i,
      /\b(nimalarni|nimani|qaysi)\b.*\b(o'lchash|o'lchaymiz|tekshirish|tekshiramiz|audit|kpi|metrics?|metrika|ko'rsatkich)\b/i,
      /\b(lms|learning management system)\b.*\b(tizim|system|platforma|platform|audit|аудит|checklist|tekshiruv|kpi|metrics?|metrika|ko'rsatkich|analitika|analytics|integratsiya|integration|crm|telephony|telefoniya|telefonia|telefon|calls?|qo['‘`]?ng['‘`]?iroq|sales|sotuv|funnel|voronka|dashboard|dashbord|bi)\b/i,
      /\b(tizim|system|platforma|platform|audit|аудит|checklist|tekshiruv|kpi|metrics?|metrika|ko'rsatkich|analitika|analytics|integratsiya|integration|crm|telephony|telefoniya|telefonia|telefon|calls?|qo['‘`]?ng['‘`]?iroq|sales|sotuv|funnel|voronka|dashboard|dashbord|bi)\b.*\b(lms|learning management system)\b/i,
      /\b(lms|learning management system)\b.*\b(crm)\b.*\b(telephony|telefoniya|telefonia|telefon|calls?|qo['‘`]?ng['‘`]?iroq)\b/i,
      /\b(crm)\b.*\b(lms|learning management system)\b.*\b(telephony|telefoniya|telefonia|telefon|calls?|qo['‘`]?ng['‘`]?iroq)\b/i,
      /\b(telephony|telefoniya|telefonia|telefon|calls?|qo['‘`]?ng['‘`]?iroq)\b.*\b(lms|learning management system)\b.*\b(crm)\b/i,
      /\b(calls?|qo['‘`]?ng['‘`]?iroqlar?|qo['‘`]?ng['‘`]?iroq)\b.*\b(sales|sotuv|metric|metrika|audit|tahlil|analysis|operator|script|skript|conversion|konversiya|funnel|voronka)\b/i,
      /\b(sales|sotuv|metric|metrika|audit|tahlil|analysis|operator|script|skript|conversion|konversiya|funnel|voronka)\b.*\b(calls?|qo['‘`]?ng['‘`]?iroqlar?|qo['‘`]?ng['‘`]?iroq)\b/i,
    ],
  },
  {
    intent: "LMS_SCHEDULE",
    patterns: [
      /\b(dars|darsim|darslар|qachon|vaqti?|jadval|schedule|keyingi dars|navbatdagi|когда|расписание)\b/i,
      /\bnext (class|session|lesson)\b/i,
    ],
  },
  {
    intent: "LMS_HOMEWORK",
    patterns: [
      /\b(uy ?vazifa|topshiriq|homework|domashka|домашка|vazifam|vazifalarim|topshiriqlarim|submit|topshir)\b/i,
    ],
  },
  {
    intent: "LMS_GRADE",
    patterns: [
      /\b(ball|baho|bahom|baholarim|natija|score|grade|оценка|баллы|result|progressim|statistika)\b/i,
    ],
  },
  {
    intent: "LMS_ATTENDANCE",
    patterns: [
      /\b(davomat|davomatim|attendance|посещаемость|missed|kelmadim|bo'ldim|qatnashdim)\b/i,
    ],
  },
  {
    intent: "SMALL_TALK",
    patterns: [
      /^(salom|assalomu|привет|hi|hello|hey|rahmat|спасибо|ok|okay|xop|hop|yaxshi|zo'r|bo'pti|tushundim|tushunarli|qabul)[!?.,]?$/i,
      /^(😊|👍|🙏|❤️|✅)+$/,
    ],
  },
  {
    intent: "COMPLAINT",
    patterns: [
      /\b(shikoyat|nizo|muammo|yomon|qo'pol|xato|ishlamayapti|tushunmadim|yordami yo'q|g'azab|norozi)\b/i,
      /\b(complaint|problem|issue|bad|rude|broken|doesn't work|not working|terrible|awful)\b/i,
    ],
  },
  {
    intent: "SUGGESTION",
    patterns: [
      /\b(taklifim|tavsiyam|takliflarim|tavsiyalarim|taklif qilaman|tavsiya qilaman|taklif qilmoqchi|menda taklif|mening taklifim|mening tavsiyam|sizga taklif|yaxshilash kerak|qo'shsa bo'ladi|bo'lsa yaxshi|nima desangiz)\b/i,
      /\b(suggestion|idea|improve|add|feature|would be nice|consider)\b/i,
    ],
  },
  {
    intent: "PRAISE",
    patterns: [
      /\b(zo'r|ajoyib|yaxshi|rahmat|maqtov|barakalla|super|perfect|great|excellent|thank)\b/i,
    ],
  },
];

// ── Layer 3: Gemini Flash classifier + in-memory cache ────────────────────────

interface CacheEntry { intent: Intent; expiresAt: number }
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

function _hash(text: string): string {
  // Simple djb2 hash — no crypto dep needed
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const VALID_INTENTS = new Set<Intent>([
  "LMS_SCHEDULE", "LMS_HOMEWORK", "LMS_GRADE", "LMS_ATTENDANCE",
  "LMS_OTHER", "AI_COURSE_QUESTION", "BUSINESS_CONSULTING", "SMALL_TALK",
  "COMPLAINT", "SUGGESTION", "PRAISE",
  "UNCLEAR",
]);

async function classifyWithGemini(text: string): Promise<Intent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "UNCLEAR";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Classify this Telegram message into exactly ONE label.
Labels: LMS_SCHEDULE | LMS_HOMEWORK | LMS_GRADE | LMS_ATTENDANCE | LMS_OTHER | AI_COURSE_QUESTION | BUSINESS_CONSULTING | SMALL_TALK | COMPLAINT | SUGGESTION | PRAISE | UNCLEAR

LMS_SCHEDULE = personal student question about their class times, schedule, next session
LMS_HOMEWORK = personal student question about their homework tasks, submission, deadlines
LMS_GRADE = personal student question about their scores, grades, results, overall progress
LMS_ATTENDANCE = personal student question about their attendance records
LMS_OTHER = other personal LMS/admin questions (login, account, etc.)
AI_COURSE_QUESTION = course content question (concepts, lessons, explanations)
BUSINESS_CONSULTING = business/system consulting question about audits, checklists, KPIs, metrics, CRM, telephony/calls, LMS as a system, sales funnels, integrations, BI/dashboards, or business process analysis. Multi-domain LMS + CRM + telephony questions belong here, not LMS labels. Structural questions that ask what to measure/check/list belong here.
SMALL_TALK = greetings, thanks, off-topic chitchat
COMPLAINT = user expressing dissatisfaction, problem, or complaint
SUGGESTION = user suggesting improvement or new feature
PRAISE = user expressing satisfaction or compliment
UNCLEAR = cannot determine intent

Message: "${text.slice(0, 300)}"

Respond with ONLY the label, nothing else.`,
            }],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 20 },
        }),
        signal: AbortSignal.timeout(5_000),
      }
    );

    if (!res.ok) return "UNCLEAR";
    const data = await res.json();
    const label = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "")
      .trim().toUpperCase().replace(/[^A-Z_]/g, "") as Intent;

    return VALID_INTENTS.has(label) ? label : "UNCLEAR";
  } catch {
    return "UNCLEAR";
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a text message. Returns intent and confidence source.
 */
export async function classifyMessage(text: string): Promise<{
  intent:  Intent;
  source:  "layer1" | "layer2" | "layer3_cache" | "layer3_api";
}> {
  // Layer 1 — commands
  if (text.startsWith("/")) {
    return { intent: "command", source: "layer1" };
  }

  const lower = text.toLowerCase().trim();

  // Layer 2 — keyword rules
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((p) => p.test(lower))) {
      return { intent: rule.intent, source: "layer2" };
    }
  }

  // Layer 3 — Gemini Flash (with cache)
  const key = _hash(lower);
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { intent: cached.intent, source: "layer3_cache" };
  }

  const intent = await classifyWithGemini(text);
  _cache.set(key, { intent, expiresAt: Date.now() + CACHE_TTL_MS });
  return { intent, source: "layer3_api" };
}

/**
 * For COMPLAINT/SUGGESTION/PRAISE intents, extract severity and tags.
 * Lightweight — no LLM call.
 */
export function extractFeedbackMeta(text: string, intent: Intent): {
  severity: "HIGH" | "MEDIUM" | "LOW" | null;
  tags: string[];
} {
  if (!["COMPLAINT", "SUGGESTION", "PRAISE"].includes(intent)) {
    return { severity: null, tags: [] };
  }

  const lower = text.toLowerCase();
  let severity: "HIGH" | "MEDIUM" | "LOW" | null = null;

  if (["yomon", "dahshatli", "terrible", "awful", "juda muammo", "very bad"].some(w => lower.includes(w))) {
    severity = "HIGH";
  } else if (["muammo", "ishlamayapti", "xato", "problem", "broken"].some(w => lower.includes(w))) {
    severity = "MEDIUM";
  } else if (intent === "COMPLAINT") {
    severity = "LOW";
  }

  const tags: string[] = [];
  if (/vazifa|homework/i.test(text)) tags.push("homework");
  if (/dars|o'qituvchi|teacher|ustoz/i.test(text)) tags.push("teacher");
  if (/jadval|schedule/i.test(text)) tags.push("schedule");
  if (/baho|ball|grade|score/i.test(text)) tags.push("grades");
  if (/platforma|sayt|website|tizim|system/i.test(text)) tags.push("platform");

  return { severity, tags };
}
