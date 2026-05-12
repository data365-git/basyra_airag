import { NextRequest, NextResponse } from "next/server";
import { askRag } from "@/lib/aiClient";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "chatbot", "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let question = "";
  try {
    const body = await req.json();
    question = String(body?.question ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: "Question required" }, { status: 400 });
  }

  if (question.length > 4000) {
    return NextResponse.json(
      { error: "Question is too long. Limit is 4000 characters." },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  const result = await askRag({
    chat_id: 0,
    question,
  });

  const raw = result.raw;
  const ok = raw !== null;

  return NextResponse.json({
    ok,
    answer: result.text,
    error: ok ? null : "RAG service is unavailable or not configured.",
    metadata: {
      mode: "admin_test",
      sent_to_telegram: false,
      response_time_ms: raw?.response_time_ms ?? Date.now() - startedAt,
      sources: raw?.sources ?? [],
      context_warning: raw?.context_warning ?? null,
      tokens_in: raw?.tokens_in ?? null,
      tokens_out: raw?.tokens_out ?? null,
      cost_usd: raw?.cost_usd ?? null,
    },
  });
}
