import { NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

const RAG_URL = process.env.RAG_SERVICE_URL ?? "";
const RAG_TOKEN = process.env.RAG_INTERNAL_TOKEN ?? "";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!RAG_URL) {
    return NextResponse.json({ error: "RAG_SERVICE_URL not configured" }, { status: 503 });
  }

  const res = await fetch(`${RAG_URL}/content`, {
    headers: { "X-Internal-Token": RAG_TOKEN },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `RAG service error: ${res.status}`, detail: text },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!RAG_URL) {
    return NextResponse.json({ error: "RAG_SERVICE_URL not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceName = body.source_name as string | undefined;
  if (!sourceName) {
    return NextResponse.json({ error: "source_name required" }, { status: 400 });
  }

  const res = await fetch(`${RAG_URL}/content/${encodeURIComponent(sourceName)}`, {
    method: "DELETE",
    headers: { "X-Internal-Token": RAG_TOKEN },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `RAG service error: ${res.status}`, detail: text },
      { status: res.status }
    );
  }

  const data = await res.json().catch(() => ({ ok: true }));
  return NextResponse.json(data);
}
