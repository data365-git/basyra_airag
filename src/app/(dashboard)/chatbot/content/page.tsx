"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

type ContentSource = {
  source_name: string;
  chunk_count?: number;
  chunks?: number;
  status?: string | null;
  ingested_at?: string | null;
  indexed_at?: string | null;
  last_indexed_at?: string | null;
  updated_at?: string | null;
  embedding_cost?: number | string | null;
  embedding_cost_usd?: number | string | null;
  enabled?: boolean | null;
  is_enabled?: boolean | null;
  disabled?: boolean | null;
  preview_snippets?: string[] | null;
  previews?: string[] | null;
  snippets?: string[] | null;
};

type ContentData = {
  ok?: boolean;
  error?: string;
  sources: ContentSource[];
  status?: string | null;
  embedding_cost?: number | string | null;
  embedding_cost_usd?: number | string | null;
  last_indexed_at?: string | null;
  updated_at?: string | null;
  chunk_count?: number;
  total_chunks?: number;
};

type GapQuestion = {
  id?: string;
  message_id?: string;
  content: string;
  status?: string | null;
  reason?: string | null;
  stars?: number;
  severity?: string | null;
  created_at: string;
};

type OverviewData = {
  answers?: {
    unanswered_count?: number;
    fallback_count?: number;
  };
  insights?: {
    low_rated_questions?: GapQuestion[];
    complaint_questions?: GapQuestion[];
  };
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number | string | null | undefined) {
  if (value == null || value === "") return "-";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "-";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}

function formatCount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString("uz-UZ");
}

function getChunkCount(source: ContentSource) {
  return source.chunk_count ?? source.chunks ?? 0;
}

function getLastIndexed(source: ContentSource) {
  return (
    source.last_indexed_at ??
    source.indexed_at ??
    source.updated_at ??
    source.ingested_at ??
    null
  );
}

function getEnabled(source: ContentSource) {
  if (typeof source.enabled === "boolean") return source.enabled;
  if (typeof source.is_enabled === "boolean") return source.is_enabled;
  if (typeof source.disabled === "boolean") return !source.disabled;
  return null;
}

function getEmbeddingCost(source: ContentSource) {
  return source.embedding_cost_usd ?? source.embedding_cost ?? null;
}

function getSnippets(source: ContentSource) {
  return source.preview_snippets ?? source.previews ?? source.snippets ?? [];
}

function truncate(text: string, max = 150) {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

async function readApiError(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return `Server error ${res.status}`;
  try {
    const data = JSON.parse(text) as { error?: string; detail?: string };
    return data.detail ? `${data.error ?? "Xato"}: ${data.detail}` : data.error ?? text;
  } catch {
    return text;
  }
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Pill({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "amber" | "blue";
}) {
  const classes = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}

export default function ChatbotContentPage() {
  const [data, setData] = useState<ContentData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadContent() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chatbot/content");
      if (!res.ok) throw new Error(await readApiError(res));
      const json = (await res.json()) as ContentData;
      if (json.ok === false) {
        setError(json.error ?? "Noma'lum xatolik");
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xato yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  async function loadOverview() {
    setOverviewLoading(true);
    try {
      const res = await fetch("/api/chatbot/overview?days=30");
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      setOverview(json);
    } catch {
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }

  useEffect(() => {
    loadContent();
    loadOverview();
  }, []);

  async function handleDelete(sourceName: string) {
    setDeleting(sourceName);
    setConfirmDelete(null);
    try {
      const res = await fetch("/api/chatbot/content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_name: sourceName }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setData((prev) =>
        prev
          ? { ...prev, sources: prev.sources.filter((s) => s.source_name !== sourceName) }
          : prev
      );
      toast.success("Manba o'chirildi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "O'chirishda xato yuz berdi");
    } finally {
      setDeleting(null);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/chatbot/content/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readApiError(res));
      await loadContent();
      toast.success("Fayl yuklandi");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Yuklashda xato yuz berdi";
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleReindex(sourceName: string) {
    setReindexing(sourceName);
    try {
      const res = await fetch(`/api/chatbot/content/${encodeURIComponent(sourceName)}/reindex`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readApiError(res));
      await loadContent();
      toast.success("Qayta indekslash boshlandi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Qayta indekslash qo'llab-quvvatlanmaydi");
    } finally {
      setReindexing(null);
    }
  }

  async function handleToggle(source: ContentSource) {
    const current = getEnabled(source);
    if (current == null) {
      toast.error("Bu manba uchun yoqish/o'chirish holati mavjud emas");
      return;
    }

    setToggling(source.source_name);
    try {
      const enabled = !current;
      const res = await fetch(`/api/chatbot/content/${encodeURIComponent(source.source_name)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      await loadContent();
      toast.success(enabled ? "Manba yoqildi" : "Manba o'chirildi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Yoqish/o'chirish qo'llab-quvvatlanmaydi");
    } finally {
      setToggling(null);
    }
  }

  const sourceCount = data?.sources.length ?? 0;
  const totalChunks =
    data?.total_chunks ??
    data?.chunk_count ??
    data?.sources.reduce((sum, s) => sum + getChunkCount(s), 0) ??
    0;
  const totalEmbeddingCost =
    data?.embedding_cost_usd ??
    data?.embedding_cost ??
    data?.sources.reduce((sum, s) => {
      const value = getEmbeddingCost(s);
      const n = typeof value === "number" ? value : Number(value ?? 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  const enabledCount = data?.sources.filter((s) => getEnabled(s) === true).length ?? 0;
  const knownEnabledCount = data?.sources.filter((s) => getEnabled(s) != null).length ?? 0;
  const latestIndexed =
    data?.last_indexed_at ??
    data?.updated_at ??
    data?.sources
      .map((s) => getLastIndexed(s))
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
    null;
  const gapQuestions = overview
    ? [
        ...(overview.insights?.low_rated_questions ?? []),
        ...(overview.insights?.complaint_questions ?? []),
      ].slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kontent va manbalar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            RAG tizimiga yuklangan fayllar, indeks holati va kontent bo&apos;shliqlari
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {uploading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Yuklanmoqda...
              </>
            ) : (
              <>
                <span className="text-base">+</span> Fayl yuklash
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <span className="text-red-500 mt-0.5">⚠️</span>
          <div>
            <p className="font-medium text-red-800">Bilim bazasiga ulanib bo&apos;lmadi</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={loadContent}
              className="mt-3 text-sm text-red-700 underline hover:no-underline"
            >
              Qayta urinish
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Manbalar" value={formatCount(sourceCount)} />
          <StatCard label="Bo'laklar" value={formatCount(totalChunks)} />
          <StatCard label="Embedding xarajati" value={formatMoney(totalEmbeddingCost)} sub="API qaytargan bo'lsa" />
          <StatCard
            label="Oxirgi indeks"
            value={formatDate(latestIndexed)}
            sub={knownEnabledCount > 0 ? `${enabledCount}/${knownEnabledCount} faol` : "Holat noma'lum"}
          />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Indeks kuzatuvi</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Backend qaytargan status va xarajat ma&apos;lumotlari avtomatik ko&apos;rsatiladi.
                </p>
              </div>
              <Pill tone={data.status ? "blue" : "gray"}>{data.status ?? "status yo'q"}</Pill>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-400">Oxirgi indekslangan</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{formatDateTime(latestIndexed)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-400">Faol manbalar</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {knownEnabledCount > 0 ? `${enabledCount}/${knownEnabledCount}` : "-"}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-400">Jami xarajat</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{formatMoney(totalEmbeddingCost)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Kontent bo&apos;shliqlari</h2>
            <p className="text-xs text-gray-400 mt-0.5 mb-4">So&apos;nggi 30 kun signallari</p>
            {overviewLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-6 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : overview ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Javobsiz xabarlar</span>
                  <span className="font-semibold text-gray-900">
                    {formatCount(overview.answers?.unanswered_count ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Fallback javoblar</span>
                  <span className="font-semibold text-gray-900">
                    {formatCount(overview.answers?.fallback_count ?? 0)}
                  </span>
                </div>
                {gapQuestions.length === 0 && (
                  <p className="text-sm text-gray-400 pt-2">
                    Hozircha past baho yoki shikoyat signali yo&apos;q.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Bo&apos;shliq ma&apos;lumoti mavjud emas. Chatbot overview API tayyor bo&apos;lsa, bu yer avtomatik to&apos;ladi.
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && !error && sourceCount === 0 && (
        <div className="text-center py-16 text-gray-400 bg-white border border-dashed border-gray-200 rounded-2xl">
          <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">
            RAG
          </div>
          <p className="text-sm font-medium">Hech qanday kontent yo&apos;q.</p>
          <p className="text-xs mt-1">Yangi fayl yuklang.</p>
        </div>
      )}

      {!loading && data && data.sources.length > 0 && (
        <div className="space-y-3">
          {data.sources.map((source) => (
            <div key={source.source_name} className="bg-white border border-gray-100 rounded-2xl px-4 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl shrink-0 text-xs font-bold uppercase">
                    {source.source_name.endsWith(".pdf") ? "PDF" : "DOC"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{source.source_name}</p>
                      {source.status && <Pill tone="blue">{source.status}</Pill>}
                      {getEnabled(source) === true && <Pill tone="green">faol</Pill>}
                      {getEnabled(source) === false && <Pill tone="amber">o&apos;chirilgan</Pill>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatCount(getChunkCount(source))} ta bo&apos;lak - indeks: {formatDateTime(getLastIndexed(source))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleReindex(source.source_name)}
                    disabled={reindexing === source.source_name}
                    className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {reindexing === source.source_name ? "..." : "Re-index"}
                  </button>
                  <button
                    onClick={() => handleToggle(source)}
                    disabled={toggling === source.source_name || getEnabled(source) == null}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {toggling === source.source_name ? "..." : getEnabled(source) === false ? "Yoqish" : "O'chirish"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(source.source_name)}
                    disabled={deleting === source.source_name}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {deleting === source.source_name ? "..." : "O'chirish"}
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-400">Status</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{source.status ?? "-"}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-400">Bo&apos;laklar</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatCount(getChunkCount(source))}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-400">Embedding</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatMoney(getEmbeddingCost(source))}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-400">Holat</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">
                    {getEnabled(source) == null ? "-" : getEnabled(source) ? "Faol" : "O'chirilgan"}
                  </p>
                </div>
              </div>
              {getSnippets(source).length > 0 && (
                <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Preview snippets</p>
                  <div className="space-y-2">
                    {getSnippets(source).slice(0, 3).map((snippet, index) => (
                      <p key={`${source.source_name}-${index}`} className="text-xs text-gray-600 leading-relaxed">
                        {truncate(snippet)}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && data && gapQuestions.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Kontentga aylantirish mumkin bo&apos;lgan savollar</h2>
          <p className="text-xs text-gray-400 mb-4">
            Past baho va shikoyatlardan olingan savollar. Kerakli javoblarni RAG hujjatlariga qo&apos;shing.
          </p>
          <div className="space-y-3">
            {gapQuestions.map((item, index) => (
              <div key={item.message_id ?? item.id ?? index} className="border border-gray-100 rounded-xl p-3">
                <p className="text-sm text-gray-700 leading-relaxed">{truncate(item.content, 220)}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {item.stars ? `${item.stars} yulduz` : item.severity ?? "signal"} - {item.status ?? "open"} - {formatDate(item.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && sourceCount > 0 && (
        <div className="border-t border-gray-100 pt-4 text-sm text-gray-500">
          {sourceCount} ta manba - {totalChunks} ta bo&apos;lak
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              O&apos;chirishni tasdiqlash
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              Quyidagi manbani o&apos;chirmoqchimisiz?
            </p>
            <p className="text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-5 break-all">
              {confirmDelete}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                O&apos;chirish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
