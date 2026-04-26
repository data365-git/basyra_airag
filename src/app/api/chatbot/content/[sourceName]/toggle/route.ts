import { NextResponse } from "next/server";
import { getFullUser } from "@/lib/getUser";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const RAG_URL = process.env.RAG_SERVICE_URL ?? "";
const RAG_TOKEN = process.env.RAG_INTERNAL_TOKEN ?? "";

type RouteParams = {
  params: Promise<{ sourceName: string }>;
};

async function requireContentPermission() {
  const user = await getFullUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user, "chatbot", "content")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function isUnsupportedStatus(status: number) {
  return status === 404 || status === 405 || status === 501;
}

export async function POST(request: Request, { params }: RouteParams) {
  const permissionError = await requireContentPermission();
  if (permissionError) return permissionError;

  if (!RAG_URL) {
    return NextResponse.json({ error: "RAG_SERVICE_URL not configured" }, { status: 503 });
  }

  const { sourceName } = await params;
  if (!sourceName) {
    return NextResponse.json({ error: "source_name required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const enabled = body.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled boolean required" }, { status: 400 });
  }

  const encoded = encodeURIComponent(sourceName);
  const headers = {
    "Content-Type": "application/json",
    "X-Internal-Token": RAG_TOKEN,
  };
  const payload = JSON.stringify({ enabled });
  const payloadWithSource = JSON.stringify({ source_name: sourceName, enabled });
  const candidates: Array<{ url: string; init: RequestInit }> = [
    {
      url: `${RAG_URL}/content/${encoded}`,
      init: { method: "PATCH", headers, body: payload },
    },
    {
      url: `${RAG_URL}/content/${encoded}/toggle`,
      init: { method: "POST", headers, body: payload },
    },
    {
      url: `${RAG_URL}/content/toggle`,
      init: { method: "POST", headers, body: payloadWithSource },
    },
  ];

  let lastDetail = "";
  for (const candidate of candidates) {
    const res = await fetch(candidate.url, candidate.init);
    if (res.ok) {
      const data = await res.json().catch(() => ({ ok: true }));
      return NextResponse.json(data);
    }

    lastDetail = await res.text().catch(() => "");
    if (!isUnsupportedStatus(res.status)) {
      return NextResponse.json(
        { error: `RAG service error: ${res.status}`, detail: lastDetail },
        { status: res.status }
      );
    }
  }

  return NextResponse.json(
    { error: "RAG enable/disable action is not supported", detail: lastDetail },
    { status: 501 }
  );
}
