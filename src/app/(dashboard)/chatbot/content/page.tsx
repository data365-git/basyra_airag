"use client";

import { useState, useEffect, useRef } from "react";

type ContentSource = {
  source_name: string;
  chunk_count: number;
  ingested_at: string | null;
};

type ContentData = {
  sources: ContentSource[];
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ChatbotContentPage() {
  const [data, setData] = useState<ContentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadContent() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chatbot/content");
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xato yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContent();
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
      if (!res.ok) throw new Error(await res.text());
      setData((prev) =>
        prev
          ? { ...prev, sources: prev.sources.filter((s) => s.source_name !== sourceName) }
          : prev
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "O'chirishda xato yuz berdi");
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
      if (!res.ok) throw new Error(await res.text());
      await loadContent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuklashda xato yuz berdi");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const totalChunks = data?.sources.reduce((sum, s) => sum + s.chunk_count, 0) ?? 0;
  const sourceCount = data?.sources.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kontent va manbalar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            RAG tizimiga yuklangan fayllar
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sourceCount === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📂</div>
          <p className="text-sm font-medium">Hech qanday kontent yo'q.</p>
          <p className="text-xs mt-1">Yangi fayl yuklang.</p>
        </div>
      )}

      {/* Sources list */}
      {!loading && data && data.sources.length > 0 && (
        <div className="space-y-3">
          {data.sources.map((source) => (
            <div
              key={source.source_name}
              className="flex items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg shrink-0 text-lg">
                  {source.source_name.endsWith(".pdf") ? "📄" : "📝"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {source.source_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {source.chunk_count} ta bo'lak · {formatDate(source.ingested_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmDelete(source.source_name)}
                disabled={deleting === source.source_name}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting === source.source_name ? "..." : "O'chirish"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats bar */}
      {!loading && sourceCount > 0 && (
        <div className="border-t border-gray-100 pt-4 text-sm text-gray-500">
          {sourceCount} ta manba · {totalChunks} ta bo'lak
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              O'chirishni tasdiqlash
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              Quyidagi manbani o'chirmoqchimisiz?
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
                O'chirish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
