"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type InboxStatus = "new" | "in_review" | "resolved" | "dismissed";

type InboxItem = {
  id: string;
  chat_id: string;
  kind: string;
  status: InboxStatus;
  priority: string;
  summary: string;
  body: string;
  classifier_score: number | null;
  participant: { id: string; full_name: string } | null;
  created_at: string;
  updated_at: string;
};

type KanbanColumn = {
  status: InboxStatus;
  label: string;
  dotColor: string;
  headerBg: string;
  nextStatus: InboxStatus | null;
  nextLabel: string | null;
};

const COLUMNS: KanbanColumn[] = [
  {
    status: "new",
    label: "Yangi",
    dotColor: "bg-blue-500",
    headerBg: "bg-blue-50",
    nextStatus: "in_review",
    nextLabel: "Ko'rib chiqilmoqda",
  },
  {
    status: "in_review",
    label: "Ko'rib chiqilmoqda",
    dotColor: "bg-amber-500",
    headerBg: "bg-amber-50",
    nextStatus: "resolved",
    nextLabel: "Hal qilindi",
  },
  {
    status: "resolved",
    label: "Hal qilindi",
    dotColor: "bg-green-500",
    headerBg: "bg-green-50",
    nextStatus: null,
    nextLabel: null,
  },
  {
    status: "dismissed",
    label: "Bekor qilindi",
    dotColor: "bg-gray-400",
    headerBg: "bg-gray-50",
    nextStatus: null,
    nextLabel: null,
  },
];

type TabKind = "complaint" | "offer" | "lead";

const TABS: { kind: TabKind; label: string; emoji: string }[] = [
  { kind: "complaint", label: "Shikoyatlar", emoji: "🔴" },
  { kind: "offer",     label: "Takliflar",   emoji: "💡" },
  { kind: "lead",      label: "Leadlar",     emoji: "💰" },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("uz-UZ", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const cls =
    pct >= 80
      ? "bg-green-50 text-green-700 border-green-200"
      : pct >= 50
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {pct}%
    </span>
  );
}

function InboxCard({
  item,
  col,
  saving,
  onMove,
}: {
  item: InboxItem;
  col: KanbanColumn;
  saving: boolean;
  onMove: (item: InboxItem, nextStatus: InboxStatus) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      {/* Header row */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <ScoreBadge score={item.classifier_score} />
        <span className="ml-auto shrink-0 text-xs text-gray-400">{formatTime(item.created_at)}</span>
      </div>

      {/* Summary */}
      <p className="mb-1 text-sm font-medium text-gray-800 line-clamp-1">{item.summary}</p>

      {/* Body */}
      <p className="mb-1.5 line-clamp-2 text-xs leading-snug text-gray-500">{item.body}</p>

      {/* Participant */}
      {item.participant ? (
        <Link
          href={`/participants/${item.participant.id}`}
          className="mb-1.5 block text-xs font-medium text-gray-700 hover:text-blue-600"
        >
          {item.participant.full_name}
        </Link>
      ) : (
        <p className="mb-1.5 text-xs text-gray-400">Anonim</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
        {col.nextStatus && (
          <button
            onClick={() => onMove(item, col.nextStatus!)}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            → {col.nextLabel}
          </button>
        )}
        {col.status !== "dismissed" && (
          <button
            onClick={() => onMove(item, "dismissed")}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Bekor qilish
          </button>
        )}
        <Link
          href={`/chat?chatId=${item.chat_id}`}
          className="ml-auto text-xs text-blue-600 hover:underline"
        >
          Chatda ochish
        </Link>
      </div>
    </div>
  );
}

export default function ChatbotInboxPage() {
  const [activeKind, setActiveKind] = useState<TabKind>("complaint");
  const [allItems, setAllItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        kind: activeKind,
        status: "new,in_review,resolved,dismissed",
        limit: "200",
      });
      const res = await fetch(`/api/chatbot/inbox?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data: { items: InboxItem[] } = await res.json();
      setAllItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuklashda xato yuz berdi");
    } finally {
      setLoading(false);
    }
  }, [activeKind]);

  useEffect(() => {
    load();
  }, [load]);

  async function moveItem(item: InboxItem, nextStatus: InboxStatus) {
    setSavingId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/chatbot/inbox/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAllItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, status: nextStatus } : row
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlashda xato yuz berdi");
    } finally {
      setSavingId(null);
    }
  }

  // Group by status
  const buckets = Object.fromEntries(
    COLUMNS.map((col) => [col.status, [] as InboxItem[]])
  ) as Record<InboxStatus, InboxItem[]>;

  for (const item of allItems) {
    const bucket = buckets[item.status as InboxStatus] ?? buckets["new"];
    bucket.push(item);
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kiruvchi xabarlar</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Botdan avtomatik tasniflangan shikoyat, taklif va leadlar.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-500 shadow-sm">
          <span className="font-semibold text-gray-900">{allItems.length}</span> ta yozuv
        </div>
      </div>

      {/* Kind tabs */}
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            onClick={() => setActiveKind(tab.kind)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeKind === tab.kind
                ? "bg-blue-600 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span>{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Kanban board */}
      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-4 ${loading ? "pointer-events-none opacity-60" : ""}`}>
        {COLUMNS.map((col) => (
          <div key={col.status}>
            <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 ${col.headerBg}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${col.dotColor}`} />
              <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
              <span className="ml-auto text-xs text-gray-400">{buckets[col.status].length}</span>
            </div>

            <div className="space-y-3">
              {buckets[col.status].map((item) => (
                <InboxCard
                  key={item.id}
                  item={item}
                  col={col}
                  saving={savingId === item.id}
                  onMove={moveItem}
                />
              ))}
              {buckets[col.status].length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                  Bo&apos;sh
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
