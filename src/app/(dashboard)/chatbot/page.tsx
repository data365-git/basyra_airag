"use client";

import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OverviewData {
  active: {
    dau: number;
    wau: number;
    mau: number;
    total_users: number;
    total_messages: number;
  };
  cost: {
    llm_usd: number;
    tts_usd: number;
    total_usd: number;
    month_start: string;
  };
  usage: {
    tokens_in: number;
    tokens_out: number;
    avg_response_time_ms: number | null;
    tts_count: number;
    top_expensive_users: Array<{
      chat_id: string;
      participant_id: string | null;
      full_name: string | null;
      cost_usd: number;
      tokens_in: number;
      tokens_out: number;
    }>;
  };
  answers: {
    ai_answered: number;
    template_answered: number;
    fallback_count: number;
    unanswered_count: number;
    routed_counts: Record<string, number>;
  };
  insights: {
    common_intents: Array<{ intent: string; count: number }>;
    low_rated_questions: Array<{
      message_id: string;
      chat_id: string;
      content: string;
      stars: number;
      reason: string | null;
      status: string;
      created_at: string;
    }>;
    complaint_questions: Array<{
      id: string;
      chat_id: string;
      participant_id: string | null;
      full_name: string | null;
      content: string;
      severity: string | null;
      status: string;
      created_at: string;
    }>;
  };
  quality: {
    total_ratings: number;
    avg_stars: number | null;
    distribution: { "1": number; "2": number; "3": number; "4": number; "5": number };
  };
  timeline: Array<{
    date: string;
    message_count: number;
    cost_usd: number;
  }>;
}

// ── Small components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Skeleton({ h = "h-24" }: { h?: string }) {
  return <div className={`bg-gray-100 rounded-2xl animate-pulse ${h}`} />;
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtUsd(n: number) {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}

function fmtMs(n: number | null) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
}

function truncate(text: string, max = 96) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ChatbotOverviewPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      fetch(`/api/chatbot/overview?days=${days}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Server error ${r.status}`);
          return r.json();
        })
        .then((d: OverviewData) => {
          if (cancelled) return;
          setData(d);
          setLoading(false);
        })
        .catch((e: Error) => {
          if (cancelled) return;
          setError(e.message);
          setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const maxDist = data
    ? Math.max(...Object.values(data.quality.distribution), 1)
    : 1;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Chat-bot Umumiy Ko&apos;rinish</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
                days === d
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {d}k
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          Xatolik: {error}
        </p>
      )}

      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Bugungi foydalanuvchilar (DAU)" value={fmt(data.active.dau)} />
          <KpiCard label="Haftalik foydalanuvchilar (WAU)" value={fmt(data.active.wau)} />
          <KpiCard label="Oylik foydalanuvchilar (MAU)" value={fmt(data.active.mau)} />
          <KpiCard
            label="Jami foydalanuvchilar"
            value={fmt(data.active.total_users)}
            sub={`${fmt(data.active.total_messages)} xabar jami`}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="AI javoblari" value={fmt(data.answers.ai_answered)} />
          <KpiCard label="Shablon/LMS javoblari" value={fmt(data.answers.template_answered)} />
          <KpiCard
            label="Fallback javoblar"
            value={fmt(data.answers.fallback_count)}
            sub="AI band bo'lgan holatlar"
          />
          <KpiCard
            label="Javobsiz user xabarlari"
            value={fmt(data.answers.unanswered_count)}
            sub="Keyingi assistant javobi topilmadi"
          />
        </div>
      ) : null}

      {/* Cost + Quality row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost panel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">
            Xarajatlar{" "}
            {data && (
              <span className="text-xs font-normal text-gray-400">
                ({data.cost.month_start} dan boshlab)
              </span>
            )}
          </p>
          {loading ? (
            <div className="space-y-2">
              <Skeleton h="h-8" />
              <Skeleton h="h-8" />
              <Skeleton h="h-8" />
            </div>
          ) : data ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">LLM (chat/embed/classify)</span>
                <span className="font-semibold text-gray-900">{fmtUsd(data.cost.llm_usd)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">TTS (ovoz)</span>
                <span className="font-semibold text-gray-900">{fmtUsd(data.cost.tts_usd)}</span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-700">Jami bu oy</span>
                <span className="font-bold text-gray-900 text-base">
                  {fmtUsd(data.cost.total_usd)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="rounded-xl bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-400">Token in</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(data.usage.tokens_in)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-400">Token out</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(data.usage.tokens_out)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-400">Avg vaqt</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {fmtMs(data.usage.avg_response_time_ms)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                TTS ishlatilgan: {fmt(data.usage.tts_count)} marta
              </p>
            </div>
          ) : null}
        </div>

        {/* Quality panel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Sifat baholari</p>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h="h-6" />)}
            </div>
          ) : data ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-gray-500">
                  O&apos;rtacha baho:{" "}
                  <strong className="text-gray-900">
                    {data.quality.avg_stars != null
                      ? `${data.quality.avg_stars.toFixed(1)} ⭐`
                      : "—"}
                  </strong>
                </span>
                <span className="text-xs text-gray-400">
                  {data.quality.total_ratings} ta baho
                </span>
              </div>
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const count = data.quality.distribution[String(star) as keyof typeof data.quality.distribution];
                const pct = maxDist > 0 ? (count / maxDist) * 100 : 0;
                const barColor =
                  star >= 4
                    ? "bg-green-400"
                    : star === 3
                    ? "bg-amber-400"
                    : "bg-red-400";
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-right text-gray-500">{star}⭐</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${barColor} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-gray-400">{count}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Eng ko&apos;p intentlar</p>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h="h-7" />)}</div>
          ) : data && data.insights.common_intents.length > 0 ? (
            <div className="space-y-2">
              {data.insights.common_intents.map((item) => (
                <div key={item.intent} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-600 truncate">{item.intent}</span>
                  <span className="text-xs font-semibold text-gray-700 bg-gray-100 rounded-full px-2 py-0.5">
                    {fmt(item.count)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Hali intent ma&apos;lumoti yo&apos;q</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Qimmat foydalanuvchilar</p>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h="h-7" />)}</div>
          ) : data && data.usage.top_expensive_users.length > 0 ? (
            <div className="space-y-3">
              {data.usage.top_expensive_users.map((item) => (
                <div key={`${item.chat_id}-${item.participant_id ?? "anon"}`}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-700 truncate">
                      {item.full_name ?? `Anonymous #${item.chat_id.slice(-6)}`}
                    </span>
                    <span className="font-semibold text-gray-900">{fmtUsd(item.cost_usd)}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {fmt(item.tokens_in + item.tokens_out)} token
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Bu oy xarajat topilmadi</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Past baho va shikoyatlar</p>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h="h-7" />)}</div>
          ) : data ? (
            <div className="space-y-3">
              {[...data.insights.low_rated_questions, ...data.insights.complaint_questions]
                .slice(0, 5)
                .map((item) => (
                  <div key={"message_id" in item ? item.message_id : item.id}>
                    <p className="text-sm text-gray-700 leading-snug">
                      {truncate(item.content)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {"stars" in item ? `${item.stars}⭐` : item.severity ?? "COMPLAINT"} · {item.status}
                    </p>
                  </div>
                ))}
              {data.insights.low_rated_questions.length === 0 &&
                data.insights.complaint_questions.length === 0 && (
                  <p className="text-sm text-gray-400">Muammo topilmadi</p>
                )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-900 mb-4">
          Kunlik faollik (so&apos;nggi {days} kun)
        </p>
        {loading ? (
          <Skeleton h="h-40" />
        ) : data && data.timeline.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-6 font-medium">Sana</th>
                  <th className="pb-2 pr-6 font-medium text-right">Foydalanuvchi xabarlari</th>
                  <th className="pb-2 font-medium text-right">Xarajat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.timeline.map((row) => (
                  <tr key={row.date} className="hover:bg-gray-50">
                    <td className="py-2 pr-6 text-gray-700 tabular-nums">{row.date}</td>
                    <td className="py-2 pr-6 text-right tabular-nums text-gray-900">
                      {row.message_count}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-500">
                      {row.cost_usd > 0 ? fmtUsd(row.cost_usd) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data && data.timeline.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Bu davr uchun ma&apos;lumot yo&apos;q
          </p>
        ) : null}
      </div>
    </div>
  );
}
