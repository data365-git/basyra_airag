/**
 * GET /api/debug/rag-search?q=<query>&t=<RAG_INTERNAL_TOKEN>
 * Diagnostic: returns top pgvector vector-search hits AND text-match hits
 * for a query, so we can compare what's actually retrievable.
 */
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

const TOKEN = process.env.RAG_INTERNAL_TOKEN ?? "";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
const RAG_DB_URL = process.env.RAG_DATABASE_URL ?? "";

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: RAG_DB_URL, max: 1 });
  return pool;
}

async function embed(text: string): Promise<number[] | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: text.slice(0, 2000) }] },
      }),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { embedding?: { values: number[] } };
  return data.embedding?.values ?? null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!TOKEN || token !== TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  const p = getPool();

  const vector = await embed(q);
  if (!vector) return NextResponse.json({ error: "embed failed" }, { status: 500 });

  const vectorLit = `[${vector.join(",")}]`;
  const { rows: chunks } = await p.query<{
    lesson_id: string;
    content: string;
    similarity: number;
  }>(
    `SELECT lesson_id::text AS lesson_id, content,
            1 - (embedding <=> $1::vector) AS similarity
     FROM chunks WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector LIMIT 5`,
    [vectorLit]
  );

  const { rows: textMatches } = await p.query<{
    lesson_id: string;
    content: string;
  }>(
    `SELECT lesson_id::text AS lesson_id, content
     FROM chunks WHERE content ILIKE $1 LIMIT 5`,
    [`%${q}%`]
  );

  return NextResponse.json({
    query: q,
    vector_search: chunks.map((c) => ({
      lesson_id:  c.lesson_id,
      similarity: parseFloat(c.similarity.toFixed(3)),
      preview:    c.content.slice(0, 250).replace(/\s+/g, " "),
    })),
    text_match: textMatches.map((c) => ({
      lesson_id: c.lesson_id,
      preview:   c.content.slice(0, 250).replace(/\s+/g, " "),
    })),
  });
}
