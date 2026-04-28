"use client";

import { useEffect, useMemo, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RatingItem {
  id: string;
  stars: number;
  reason: string | null;
  curator_note: string | null;
  status: string | null;
  created_at: string | null;
  answer: {
    id: string | null;
    content: string | null;
    chat_id: string | null;
    created_at: string | null;
  };
  question: {
    content: string | null;
    created_at: string | null;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Hozir";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} daqiqa oldin`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} soat oldin`;
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return "Kecha";
  if (days < 30) return `${days} kun oldin`;
  if (days < 365) return `${Math.floor(days / 30)} oy oldin`;
  return `${Math.floor(days / 365)} yil oldin`;
}

function starsLabel(stars: number): string {
  const filled = "★".repeat(stars);
  const empty = "☆".repeat(5 - stars);
  return filled + empty;
}

function shortId(id: string | null): string {
  if (!id) return "—";
  return id.slice(-6);
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-24 bg-gray-100 rounded-full" />
        <div className="h-4 w-16 bg-gray-100 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-1/4 bg-gray-100 rounded-full" />
        <div className="h-4 w-3/4 bg-gray-100 rounded-full" />
        <div className="h-3 w-1/4 bg-gray-100 rounded-full mt-3" />
        <div className="h-4 w-full bg-gray-100 rounded-full" />
        <div className="h-4 w-5/6 bg-gray-100 rounded-full" />
      </div>
    </div>
  );
}

// ── Rating card ────────────────────────────────────────────────────────────────

function RatingCard({ item }: { item: RatingItem }) {
  const [expanded, setExpanded] = useState(false);

  const borderClass =
    item.stars === 1
      ? "border-red-200 bg-red-50/30"
      : "border-amber-200 bg-amber-50/30";

  return (
    <div className={`border rounded-2xl p-5 shadow-sm ${borderClass}`}>
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-base font-mono tracking-widest ${
            item.stars === 1 ? "text-red-500" : "text-amber-500"
          }`}
        >
          {starsLabel(item.stars)}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{relativeTime(item.created_at)}</span>
          <span className="text-xs font-mono text-gray-400 bg-white/70 border border-gray-200 rounded px-1.5 py-0.5">
            #{shortId(item.answer.id)}
          </span>
        </div>
      </div>

      {item.question.content && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Savol
          </p>
          <p className="text-sm text-gray-800 leading-snug">
            &ldquo;{item.question.content}&rdquo;
          </p>
        </div>
      )}

      {item.answer.content && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Javob
          </p>
          <p
            className={`text-sm text-gray-700 leading-snug ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {item.answer.content}
          </p>
          {item.answer.content.length > 200 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              {expanded ? "Yig'ish" : "Ko'proq"}
            </button>
          )}
        </div>
      )}

      {item.reason && (
        <div className="mt-2 rounded-xl bg-white/60 border border-gray-200 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">
            Sabab
          </p>
          <p className="text-sm text-gray-700">{item.reason}</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RatingsPage() {
  const [ratings, setRatings] = useState<RatingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starsFilter, setStarsFilter] = useState<0 | 1 | 2>(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/chatbot/ratings")
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`);
        return r.json() as Promise<{ ratings: RatingItem[] }>;
      })
      .then((d) => {
        setRatings(d.ratings);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const now = Date.now();
  const oneStarCount = ratings.filter((r) => r.stars === 1).length;
  const twoStarCount = ratings.filter((r) => r.stars === 2).length;
  const thisWeekCount = ratings.filter(
    (r) => r.created_at && now - new Date(r.created_at).getTime() < 7 * 86_400_000
  ).length;

  const filtered = useMemo(() => {
    let list = ratings;
    if (starsFilter !== 0) list = list.filter((r) => r.stars === starsFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.reason?.toLowerCase().includes(q) ||
          r.answer.content?.toLowerCase().includes(q) ||
          r.question.content?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [ratings, starsFilter, search]);

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Past baholar</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          1★ va 2★ baholar — sifat regressiyasi uchun
        </p>
      </div>

      {/* Stats strip */}
      {!loading && !error && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-2">
            <span className="text-sm font-mono text-red-500">★☆☆☆☆</span>
            <span className="text-sm font-semibold text-red-700">{oneStarCount} ta</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
            <span className="text-sm font-mono text-amber-500">★★☆☆☆</span>
            <span className="text-sm font-semibold text-amber-700">{twoStarCount} ta</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-500">Bu hafta</span>
            <span className="text-sm font-semibold text-gray-700">{thisWeekCount} ta</span>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 self-start">
          {([0, 1, 2] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStarsFilter(s)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                starsFilter === s
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {s === 0 ? "Barchasi" : s === 1 ? "1★" : "2★"}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sabab yoki javob bo'yicha qidirish..."
          className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          Xatolik: {error}
        </p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Rating cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((item) => (
            <RatingCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-2xl mb-2">Hali past baholar yo&apos;q</p>
          <p className="text-sm">Barcha baholar 3 yulduz va undan yuqori</p>
        </div>
      )}
    </div>
  );
}
