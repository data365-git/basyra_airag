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
}

export interface AskResponse {
  answer:           string;
  sources:          string[];
  context_warning:  boolean;
  tokens_in:        number;
  tokens_out:       number;
  cost_usd:         number;
  response_time_ms: number;
}

const FALLBACK_MESSAGE =
  "AI yordamchim hozir band. Savolingizni murabbiyga yetkazaman 🙏";

/**
 * Ask the RAG service a question.
 * Returns the answer text, or the fallback message if the service is unavailable.
 * Never throws.
 */
export async function askRag(req: AskRequest): Promise<{ text: string; raw: AskResponse | null }> {
  if (!RAG_URL) {
    console.warn("[aiClient] RAG_SERVICE_URL not configured");
    return { text: FALLBACK_MESSAGE, raw: null };
  }

  try {
    const res = await fetch(`${RAG_URL}/ask`, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Internal-Token": RAG_TOKEN,
      },
      body:    JSON.stringify(req),
      signal:  AbortSignal.timeout(15_000), // 15s max
    });

    if (!res.ok) {
      console.warn(`[aiClient] RAG service returned ${res.status}`);
      return { text: FALLBACK_MESSAGE, raw: null };
    }

    const data = await res.json() as AskResponse;
    return { text: data.answer, raw: data };
  } catch (err) {
    console.error("[aiClient] RAG service error:", err);
    return { text: FALLBACK_MESSAGE, raw: null };
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
}): Promise<void> {
  try {
    const { default: prisma } = await import("@/lib/prisma");
    await prisma.botMessage.create({ data: {
      chatId:        params.chatId,
      participantId: params.participantId ?? null,
      role:          params.role,
      content:       params.content,
      intent:        params.intent ?? null,
      routedTo:      params.routedTo ?? null,
      tokenCount:    params.tokenCount ?? null,
    }});
  } catch (err) {
    console.error("[aiClient] logBotMessage failed:", err);
  }
}
