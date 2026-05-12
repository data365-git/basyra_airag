import { NextResponse } from "next/server";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const RAG_URL = process.env.RAG_SERVICE_URL ?? "";
const RAG_TOKEN = process.env.RAG_INTERNAL_TOKEN ?? "";

export async function POST(request: Request) {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user, "chatbot", "content")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!RAG_URL) {
    return NextResponse.json({ error: "RAG_SERVICE_URL not configured" }, { status: 503 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const res = await fetch(`${RAG_URL}/content/upload`, {
    method: "POST",
    headers: { "X-Internal-Token": RAG_TOKEN },
    body: formData,
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
