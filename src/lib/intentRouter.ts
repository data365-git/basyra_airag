/**
 * 3-layer intent router for the unified Basyra bot.
 *
 * Layer 1: Hard signals (commands → "command")
 * Layer 2: Keyword/regex table → LMS intents
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
  | "SMALL_TALK"
  | "UNCLEAR";

// ── Layer 2: keyword table ────────────────────────────────────────────────────

const KEYWORD_RULES: Array<{ intent: Intent; patterns: RegExp[] }> = [
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
      /\b(uy ?vazifa|topshiriq|homework|domashka|домашка|vazifam|topshiriqlarim|submit|topshir)\b/i,
    ],
  },
  {
    intent: "LMS_GRADE",
    patterns: [
      /\b(ball|baho|natija|score|grade|оценка|баллы|result|progressim|statistika)\b/i,
    ],
  },
  {
    intent: "LMS_ATTENDANCE",
    patterns: [
      /\b(davomat|attendance|посещаемость|missed|kelmadim|bo'ldim|qatnashdim)\b/i,
    ],
  },
  {
    intent: "SMALL_TALK",
    patterns: [
      /^(salom|assalomu|привет|hi|hello|hey|rahmat|спасибо|ok|okay|xop|yaxshi|zo'r)[!?.,]?$/i,
      /^(😊|👍|🙏|❤️|✅)+$/,
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
  "LMS_OTHER", "AI_COURSE_QUESTION", "SMALL_TALK", "UNCLEAR",
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
Labels: LMS_SCHEDULE | LMS_HOMEWORK | LMS_GRADE | LMS_ATTENDANCE | LMS_OTHER | AI_COURSE_QUESTION | SMALL_TALK | UNCLEAR

LMS_SCHEDULE = asking about class times, schedule, next session
LMS_HOMEWORK = asking about homework tasks, submission, deadlines
LMS_GRADE = asking about scores, grades, results, overall progress
LMS_ATTENDANCE = asking about attendance records
LMS_OTHER = other LMS/admin questions (login, account, etc.)
AI_COURSE_QUESTION = course content question (concepts, lessons, explanations)
SMALL_TALK = greetings, thanks, off-topic chitchat
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
