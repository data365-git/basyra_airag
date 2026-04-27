import { NextResponse } from "next/server";
import { GET as getChatThreads } from "../../chat/threads/route";

export const dynamic = "force-dynamic";

function legacyHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Deprecation", "true");
  headers.set("Link", '</api/chat/threads>; rel="successor-version"');
  return headers;
}

export async function GET() {
  const response = await getChatThreads();
  const headers = legacyHeaders(response);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Request failed" }));
    return NextResponse.json(payload, { status: response.status, headers });
  }

  const payload = await response.json() as { threads?: unknown[]; total?: unknown };
  const threads = Array.isArray(payload.threads) ? payload.threads : [];

  return NextResponse.json(
    {
      ...payload,
      threads,
      conversations: threads,
      total: payload.total ?? threads.length,
    },
    { status: response.status, headers },
  );
}
