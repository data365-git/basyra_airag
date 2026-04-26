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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ChatbotOverviewPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/chatbot/overview?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`);
        return r.json();
      })
      .then((d: OverviewData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
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
