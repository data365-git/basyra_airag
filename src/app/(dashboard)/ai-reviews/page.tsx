"use client";

import { useEffect, useState } from "react";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";

// ---- Types ----

interface RatingRow {
  id: string;
  stars: number;
  reason: string | null;
  comment: string | null;
  status: string;
  rated_at: string;
  question: string;
  message_id: string;
  participant_name: string | null;
  participant_id: string | null;
}

interface StatsData {
  avg_stars: number | null;
  avg_stars_7d: number | null;
  delta_7d: number | null;
  new_count: number;
  fixed_rate: number | null;
  total_rated: number;
}

interface DrawerData {
  rating: {
    id: string;
    stars: number;
    reason: string | null;
    comment: string | null;
    status: string;
  };
  question: string;
  answer: string;
  context: { role: string; content: string; createdAt: string }[];
  participant: { fullName: string } | null;
}

// ---- Inline components ----

function MetricTile({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border p-4 shadow-sm ${
        highlight ? "border-red-200" : "border-gray-100"
      }`}
    >
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 ${
          highlight ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new: { label: "Yangi", cls: "bg-red-100 text-red-700" },
    triaging: { label: "Ko'rib chiq", cls: "bg-amber-100 text-amber-700" },
    fixed: { label: "Tuzatildi", cls: "bg-green-100 text-green-700" },
    wont_fix: { label: "E'tiborsiz", cls: "bg-gray-100 text-gray-500" },
  };
  const m = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function ReasonLabel({ reason }: { reason: string | null }) {
  if (!reason) return null;
  const labels: Record<string, string> = {
    wrong: "Noto'g'ri",
    unclear: "Tushunarsiz",
    offtopic: "Mavzudan tashqari",
    other: "Boshqa",
  };
  return (
    <span className="mt-1.5 inline-block text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
      {labels[reason] ?? reason}
    </span>
  );
}

function RatingCard({
  rating,
  onStatusChange,
  onClick,
}: {
  rating: RatingRow;
  onStatusChange: (id: string, status: string) => void;
  onClick: () => void;
}) {
  const starColor =
    rating.stars <= 2
      ? "text-red-500"
      : rating.stars === 3
      ? "text-amber-500"
      : "text-green-600";

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:shadow-sm transition-shadow text-left w-full"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-700 font-medium leading-snug line-clamp-2">
          {rating.question}
        </p>
        <span className={`shrink-0 text-sm font-bold ${starColor}`}>
          {"⭐".repeat(rating.stars)}
        </span>
      </div>
      <ReasonLabel reason={rating.reason} />
      {rating.comment && (
        <p className="text-xs text-gray-400 mt-1 italic line-clamp-1">
          &ldquo;{rating.comment}&rdquo;
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-gray-400">
          {rating.participant_name ?? "Noma'lum"}
        </p>
        <div className="flex gap-1">
          {rating.status === "new" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(rating.id, "triaging");
              }}
              className="text-xs text-amber-600 hover:underline"
            >
              → Ko&apos;rib chiq
            </button>
          )}
          {rating.status === "triaging" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(rating.id, "fixed");
              }}
              className="text-xs text-green-600 hover:underline"
            >
              ✓ Tuzatildi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Kanban config ----

const STATUS_COLUMNS = [
  { key: "new", label: "Yangi", color: "bg-red-50 border-red-200" },
  {
    key: "triaging",
    label: "Ko'rib chiqilmoqda",
    color: "bg-amber-50 border-amber-200",
  },
  { key: "fixed", label: "Tuzatildi", color: "bg-green-50 border-green-200" },
  {
    key: "wont_fix",
    label: "E'tiborsiz",
    color: "bg-gray-50 border-gray-200",
  },
];

// ---- Main page ----

export default function AIReviewsPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStars, setFilterStars] = useState("");
  const [filterStatus, setFilterStatus] = useState("new");
  const [filterDays, setFilterDays] = useState(30);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);

  async function openDrawer(id: string) {
    const res = await fetch(`/api/ai-reviews/${id}`);
    if (res.ok) setDrawerData(await res.json());
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerData(null);
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/ai-reviews/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setRatings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    );
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterStars) params.set("stars", filterStars);
    if (filterStatus) params.set("status", filterStatus);
    params.set("days", String(filterDays));

    setLoading(true);
    Promise.all([
      fetch(`/api/ai-reviews?${params}`).then((r) => r.json()),
      fetch("/api/ai-reviews/stats").then((r) => r.json()),
    ]).then(([data, statsData]) => {
      setRatings(data.ratings ?? []);
      setStats(statsData);
      setLoading(false);
    });
  }, [filterStars, filterStatus, filterDays]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">AI Javoblar Sifati</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView("kanban")}
            className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
              view === "kanban"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView("list")}
            className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
              view === "list"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Ro&apos;yxat
          </button>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricTile
          label="O'rtacha baho"
          value={
            stats?.avg_stars != null
              ? `${stats.avg_stars.toFixed(1)} ⭐`
              : "—"
          }
          sub={
            stats?.delta_7d != null
              ? `${stats.delta_7d > 0 ? "↑" : "↓"} ${Math.abs(
                  stats.delta_7d
                ).toFixed(1)} bu hafta`
              : undefined
          }
        />
        <MetricTile
          label="Yangi shikoyatlar"
          value={String(stats?.new_count ?? "—")}
          highlight={(stats?.new_count ?? 0) > 10}
        />
        <MetricTile
          label="Jami baholangan"
          value={String(stats?.total_rated ?? "—")}
        />
        <MetricTile
          label="Tuzatilgan"
          value={
            stats?.fixed_rate != null ? `${stats.fixed_rate}%` : "—"
          }
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border rounded-lg px-3 py-1.5"
        >
          <option value="">Barcha holat</option>
          <option value="new">Yangi</option>
          <option value="triaging">Ko&apos;rib chiqilmoqda</option>
          <option value="fixed">Tuzatildi</option>
          <option value="wont_fix">E&apos;tiborsiz</option>
        </select>
        <select
          value={filterStars}
          onChange={(e) => setFilterStars(e.target.value)}
          className="text-sm border rounded-lg px-3 py-1.5"
        >
          <option value="">Barcha yulduz</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {"⭐".repeat(n)}
            </option>
          ))}
        </select>
        <select
          value={filterDays}
          onChange={(e) => setFilterDays(Number(e.target.value))}
          className="text-sm border rounded-lg px-3 py-1.5"
        >
          <option value={7}>7 kun</option>
          <option value={30}>30 kun</option>
          <option value={90}>90 kun</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">
          Yuklanmoqda...
        </div>
      ) : view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map((col) => {
            const cards = ratings
              .filter((r) => r.status === col.key)
              .sort((a, b) => a.stars - b.stars);
            return (
              <div
                key={col.key}
                className={`min-w-[280px] flex-1 rounded-2xl border ${col.color} p-3`}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {col.label}
                  </p>
                  <span className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-500">
                    {cards.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {cards.slice(0, 20).map((r) => (
                    <RatingCard
                      key={r.id}
                      rating={r}
                      onStatusChange={handleStatusChange}
                      onClick={() => openDrawer(r.id)}
                    />
                  ))}
                  {cards.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">
                      Bo&apos;sh
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>⭐</Th>
              <Th>Savol</Th>
              <Th>Sabab</Th>
              <Th>Izoh</Th>
              <Th>O&apos;quvchi</Th>
              <Th>Holat</Th>
              <Th>Sana</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {ratings.length === 0 ? (
              <EmptyRow cols={8} message="Ma'lumot topilmadi" />
            ) : (
              ratings.map((r) => (
                <Tr
                  key={r.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => openDrawer(r.id)}
                >
                  <Td>
                    <span
                      className={
                        r.stars <= 2
                          ? "text-red-500"
                          : r.stars === 3
                          ? "text-amber-500"
                          : "text-green-600"
                      }
                    >
                      {"⭐".repeat(r.stars)}
                    </span>
                  </Td>
                  <Td className="max-w-xs truncate text-sm">{r.question}</Td>
                  <Td className="text-xs text-gray-500">{r.reason ?? "—"}</Td>
                  <Td className="text-xs text-gray-400 italic max-w-32 truncate">
                    {r.comment ?? "—"}
                  </Td>
                  <Td className="text-xs">{r.participant_name ?? "—"}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td className="text-xs text-gray-400">
                    {new Date(r.rated_at).toLocaleDateString("uz")}
                  </Td>
                  <td className="px-4 py-3">
                    <select
                      value={r.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleStatusChange(r.id, e.target.value);
                      }}
                      className="text-xs border rounded px-1.5 py-1"
                    >
                      <option value="new">Yangi</option>
                      <option value="triaging">Ko&apos;rib chiq</option>
                      <option value="fixed">Tuzatildi</option>
                      <option value="wont_fix">E&apos;tiborsiz</option>
                    </select>
                  </td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      )}

      {/* Drawer */}
      {drawerOpen && drawerData && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/40"
            onClick={closeDrawer}
          />
          <div className="w-full max-w-lg bg-white shadow-2xl overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">
                Sharh #{drawerData.rating.id.slice(-6)}
              </h2>
              <button
                onClick={closeDrawer}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-gray-500">
                O&apos;quvchi:{" "}
                <strong>
                  {drawerData.participant?.fullName ?? "Noma'lum"}
                </strong>
              </p>
              <p className="text-gray-500">
                Baho:{" "}
                <strong>{"⭐".repeat(drawerData.rating.stars)}</strong>
              </p>
              {drawerData.rating.reason && (
                <p className="text-gray-500">
                  Sabab: <strong>{drawerData.rating.reason}</strong>
                </p>
              )}
              {drawerData.rating.comment && (
                <p className="text-gray-400 italic">
                  &ldquo;{drawerData.rating.comment}&rdquo;
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Savol
              </p>
              <p className="text-sm text-gray-800 bg-gray-50 rounded-xl p-3">
                {drawerData.question}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                AI Javobi
              </p>
              <p className="text-sm text-gray-700 bg-blue-50 rounded-xl p-3 whitespace-pre-wrap">
                {drawerData.answer}
              </p>
            </div>
            {drawerData.context?.length > 0 && (
              <details>
                <summary className="text-xs text-gray-400 cursor-pointer">
                  Suhbat konteksti ({drawerData.context.length} xabar)
                </summary>
                <div className="mt-2 space-y-1.5">
                  {drawerData.context.map(
                    (m: { role: string; content: string }, i: number) => (
                      <div
                        key={i}
                        className={`text-xs p-2 rounded-lg ${
                          m.role === "user"
                            ? "bg-gray-100 text-gray-700"
                            : "bg-blue-50 text-blue-800"
                        }`}
                      >
                        <span className="font-semibold">
                          {m.role === "user" ? "O'quvchi" : "Bot"}:{" "}
                        </span>
                        {m.content.slice(0, 200)}
                      </div>
                    )
                  )}
                </div>
              </details>
            )}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Holat
              </p>
              <div className="flex gap-2 flex-wrap">
                {["new", "triaging", "fixed", "wont_fix"].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      handleStatusChange(drawerData.rating.id, s);
                      closeDrawer();
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                      drawerData.rating.status === s
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "border-gray-200 text-gray-600 hover:border-indigo-300"
                    }`}
                  >
                    {s === "new"
                      ? "Yangi"
                      : s === "triaging"
                      ? "Ko'rib chiq"
                      : s === "fixed"
                      ? "Tuzatildi"
                      : "E'tiborsiz"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
