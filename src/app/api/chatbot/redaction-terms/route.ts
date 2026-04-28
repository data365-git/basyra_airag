import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

const RAG_BASE  = process.env.RAG_SERVICE_URL ?? "";
const RAG_TOKEN = process.env.RAG_INTERNAL_TOKEN ?? "";

async function ragFetch(path: string, init?: RequestInit) {
  return fetch(`${RAG_BASE}${path}`, {
    ...init,
    headers: { "X-Internal-Token": RAG_TOKEN, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await ragFetch("/redaction-terms");
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const res = await ragFetch("/redaction-terms", { method: "POST", body: JSON.stringify(body) });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  const res = await ragFetch(`/redaction-terms/${id}`, { method: "DELETE" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
