/**
 * Client for the basyra-rag Python FastAPI service.
 *
 * Endpoint: POST {RAG_SERVICE_URL}/ask
 * Auth: X-Internal-Token header
 *
 * Falls back gracefully if the service is down — never throws to callers.
 */

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
`.trim();

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
