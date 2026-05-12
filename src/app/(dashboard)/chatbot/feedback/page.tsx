"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const CATEGORY_OPTIONS = [
  { value: "all", label: "Barcha kategoriyalar" },
  { value: "COMPLAINT", label: "Shikoyat" },
  { value: "SUGGESTION", label: "Taklif" },
  { value: "PRAISE", label: "Maqtov" },
];

const CATEGORY_META: Record<string, { label: string; className: string }> = {
  COMPLAINT: { label: "Shikoyat", className: "bg-red-50 text-red-700 border-red-200" },
  SUGGESTION: { label: "Taklif", className: "bg-amber-50 text-amber-700 border-amber-200" },
  PRAISE: { label: "Maqtov", className: "bg-green-50 text-green-700 border-green-200" },
};

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  HIGH: { label: "High", className: "bg-red-50 text-red-700 border-red-200" },
  MEDIUM: { label: "Medium", className: "bg-orange-50 text-orange-700 border-orange-200" },
  LOW: { label: "Low", className: "bg-gray-50 text-gray-600 border-gray-200" },
};

type FeedbackStatus = "new" | "in_review" | "resolved" | "cancelled";

type FeedbackItem = {
  id: string;
  created_at: string;
  category: string;
  severity: string | null;
  tags: string[];
  message_text: string;
  status: FeedbackStatus;
  curator_note: string | null;
  chat_id: string;
  participant: {
    id: string;
    full_name: string;
    phone: string | null;
  } | null;
};

type KanbanColumn = {
  status: FeedbackStatus;
  label: string;
  dotColor: string;
  headerBg: string;
  nextStatus: FeedbackStatus | null;
  nextLabel: string | null;
  backStatus: FeedbackStatus | null;
  backLabel: string | null;
};

const COLUMNS: KanbanColumn[] = [
  {
    status: "new",
    label: "Yangi",
    dotColor: "bg-blue-500",
    headerBg: "bg-blue-50",
    nextStatus: "in_review",
    nextLabel: "Ko'rib chiqilmoqda",
    backStatus: null,
    backLabel: null,
  },
  {
    status: "in_review",
    label: "Ko'rib chiqilmoqda",
    dotColor: "bg-amber-500",
    headerBg: "bg-amber-50",
    nextStatus: "resolved",
    nextLabel: "Hal qilindi",
    backStatus: null,
    backLabel: null,
  },
  {
    status: "resolved",
    label: "Hal qilindi",
    dotColor: "bg-green-500",
    headerBg: "bg-green-50",
    nextStatus: null,
    nextLabel: null,
    backStatus: null,
    backLabel: null,
  },
  {
    status: "cancelled",
    label: "Bekor qilindi",
    dotColor: "bg-gray-400",
    headerBg: "bg-gray-50",
    nextStatus: null,
    nextLabel: null,
    backStatus: "new",
    backLabel: "Qaytarish",
  },
];

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type FeedbackCardProps = {
  item: FeedbackItem;
  col: KanbanColumn;
  savingId: string | null;
  noteDraft: string;
  onNoteChange: (id: string, value: string) => void;
  onMove: (item: FeedbackItem, nextStatus: FeedbackStatus) => void;
  onSaveNote: (item: FeedbackItem) => void;
};

function FeedbackCard({
  item,
  col,
  savingId,
  noteDraft,
  onNoteChange,
  onMove,
  onSaveNote,
}: FeedbackCardProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const isSaving = savingId === item.id;

  const categoryMeta = CATEGORY_META[item.category] ?? {
    label: item.category,
    className: "bg-gray-50 text-gray-600 border-gray-200",
  };
  const severityMeta = item.severity ? SEVERITY_META[item.severity] : null;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      {/* Header row: badges + time */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge className={categoryMeta.className}>{categoryMeta.label}</Badge>
        {severityMeta && <Badge className={severityMeta.className}>{severityMeta.label}</Badge>}
        {item.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
            #{tag}
          </span>
        ))}
        <span className="ml-auto shrink-0 text-xs text-gray-400">{formatTime(item.created_at)}</span>
      </div>

      {/* Message text — 2-line clamp */}
      <p className="mb-1.5 line-clamp-2 text-sm leading-snug text-gray-800">{item.message_text}</p>

      {/* Participant name */}
      {item.participant ? (
        <Link
          href={`/participants/${item.participant.id}`}
          className="mb-1.5 block text-xs font-medium text-gray-700 hover:text-blue-600"
        >
          {item.participant.full_name}
        </Link>
      ) : null}

      {/* Note toggle */}
      <button
        onClick={() => setNoteOpen((v) => !v)}
        className="mb-2 text-xs text-gray-400 hover:text-gray-600"
      >
        📝 {noteOpen ? "Yopish" : "Izoh"}
        {noteDraft ? " ✓" : ""}
      </button>

      {noteOpen && (
        <div className="mb-2 space-y-1.5">
          <textarea
            value={noteDraft}
            onChange={(e) => onNoteChange(item.id, e.target.value)}
            rows={2}
            placeholder="Ichki izoh..."
            className="w-full resize-y rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={() => onSaveNote(item)}
            disabled={isSaving}
            className="rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      )}

      <div className="border-t border-gray-100 pt-2">
        <div className="flex flex-wrap gap-1.5">
          {col.nextStatus && (
            <button
              onClick={() => onMove(item, col.nextStatus!)}
              disabled={isSaving}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              → {col.nextLabel}
            </button>
          )}
          {col.backStatus && (
            <button
              onClick={() => onMove(item, col.backStatus!)}
              disabled={isSaving}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              ← {col.backLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatbotFeedbackPage() {
  const [allItems, setAllItems] = useState<FeedbackItem[]>([]);
  const [category, setCategory] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ status: "all", limit: "200", category });
      if (attentionOnly) params.set("focus", "attention");

      const res = await fetch(`/api/chatbot/feedback?${params}`);
      if (!res.ok) throw new Error(await res.text());

      const data: { items: FeedbackItem[] } = await res.json();
      const items = data.items ?? [];
      setAllItems(items);
      setNoteDrafts(
        Object.fromEntries(items.map((item) => [item.id, item.curator_note ?? ""]))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fikrlarni yuklashda xato yuz berdi");
    } finally {
      setLoading(false);
    }
  }, [attentionOnly, category]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveFeedback(item: FeedbackItem, nextStatus?: FeedbackStatus) {
    setSavingId(item.id);
    setError(null);

    try {
      const res = await fetch(`/api/chatbot/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus ?? item.status,
          curator_note: noteDrafts[item.id] ?? "",
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const updated: { status: FeedbackStatus; curator_note: string | null } = await res.json();
      setAllItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, status: updated.status, curator_note: updated.curator_note }
            : row
        )
      );
      setNoteDrafts((prev) => ({ ...prev, [item.id]: updated.curator_note ?? "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlashda xato yuz berdi");
    } finally {
      setSavingId(null);
    }
  }

  // Group items by status; unknown statuses fall into "new"
  const buckets = Object.fromEntries(
    COLUMNS.map((col) => [col.status, [] as FeedbackItem[]])
  ) as Record<FeedbackStatus, FeedbackItem[]>;

  for (const item of allItems) {
    const bucket = buckets[item.status] ?? buckets["new"];
    bucket.push(item);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Chatbot fikrlari</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Bot orqali kelgan shikoyat, taklif va maqtovlarni ko&apos;rib chiqing.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-500 shadow-sm">
          <span className="font-semibold text-gray-900">{allItems.length}</span> ta fikr
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCategory(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === opt.value
                    ? "bg-blue-600 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className="ml-auto inline-flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(e) => setAttentionOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Low-rated yoki shikoyatlarga fokus
          </label>
        </div>
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
            {/* Column header */}
            <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 ${col.headerBg}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${col.dotColor}`} />
              <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
              <span className="ml-auto text-xs text-gray-400">{buckets[col.status].length}</span>
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {buckets[col.status].map((item) => (
                <FeedbackCard
                  key={item.id}
                  item={item}
                  col={col}
                  savingId={savingId}
                  noteDraft={noteDrafts[item.id] ?? ""}
                  onNoteChange={(id, value) =>
                    setNoteDrafts((prev) => ({ ...prev, [id]: value }))
                  }
                  onMove={(feedbackItem, nextStatus) => saveFeedback(feedbackItem, nextStatus)}
                  onSaveNote={(feedbackItem) => saveFeedback(feedbackItem)}
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
