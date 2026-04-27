"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyRow, Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";

const STATUS_OPTIONS = [
  { value: "new", label: "Yangi" },
  { value: "in_review", label: "Ko'rilmoqda" },
  { value: "resolved", label: "Hal qilindi" },
  { value: "all", label: "Hammasi" },
];

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

type FeedbackStatus = "new" | "in_review" | "resolved";

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

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export default function ChatbotFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [status, setStatus] = useState("new");
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
      const params = new URLSearchParams({ status, category });
      if (attentionOnly) params.set("focus", "attention");

      const res = await fetch(`/api/chatbot/feedback?${params}`);
      if (!res.ok) throw new Error(await res.text());

      const data: { items: FeedbackItem[] } = await res.json();
      setItems(data.items ?? []);
      setNoteDrafts(
        Object.fromEntries((data.items ?? []).map((item) => [item.id, item.curator_note ?? ""]))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fikrlarni yuklashda xato yuz berdi");
    } finally {
      setLoading(false);
    }
  }, [attentionOnly, category, status]);

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
      setItems((prev) =>
        prev
          .map((row) =>
            row.id === item.id
              ? { ...row, status: updated.status, curator_note: updated.curator_note }
              : row
          )
          .filter((row) => status === "all" || row.status === status)
      );
      setNoteDrafts((prev) => ({ ...prev, [item.id]: updated.curator_note ?? "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlashda xato yuz berdi");
    } finally {
      setSavingId(null);
    }
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
          <span className="font-semibold text-gray-900">{items.length}</span> ta fikr
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="min-w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm normal-case tracking-normal text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Kategoriya
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-w-52 rounded-lg border border-gray-300 px-3 py-2 text-sm normal-case tracking-normal text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-gray-700 lg:mt-6">
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

      <div className={loading ? "pointer-events-none opacity-60" : ""}>
        <Table>
          <Thead>
            <tr>
              <Th>Fikr</Th>
              <Th>O&apos;quvchi</Th>
              <Th>Holat</Th>
              <Th>Kurator izohi</Th>
              <Th>Amallar</Th>
            </tr>
          </Thead>
          <Tbody>
            {items.length === 0 && !loading ? (
              <EmptyRow cols={5} message="Fikr-mulohazalar topilmadi" />
            ) : (
              items.map((item) => {
                const categoryMeta = CATEGORY_META[item.category] ?? {
                  label: item.category,
                  className: "bg-gray-50 text-gray-600 border-gray-200",
                };
                const severityMeta = item.severity ? SEVERITY_META[item.severity] : null;

                return (
                  <Tr key={item.id} className="align-top">
                    <Td className="min-w-[320px] max-w-xl">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={categoryMeta.className}>{categoryMeta.label}</Badge>
                          {severityMeta && (
                            <Badge className={severityMeta.className}>{severityMeta.label}</Badge>
                          )}
                          <span className="text-xs text-gray-400">{formatDate(item.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                          {item.message_text}
                        </p>
                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Td>

                    <Td className="min-w-48">
                      {item.participant ? (
                        <div>
                          <Link
                            href={`/participants/${item.participant.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600"
                          >
                            {item.participant.full_name}
                          </Link>
                          <div className="mt-0.5 text-xs text-gray-400">
                            {item.participant.phone ?? "Telefon yo'q"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Bog&apos;lanmagan</span>
                      )}
                      <Link
                        href={`/chat?chatId=${item.chat_id}`}
                        className="mt-2 inline-flex rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                      >
                        Chat ID: {item.chat_id}
                      </Link>
                    </Td>

                    <Td className="min-w-40">
                      <select
                        value={item.status}
                        onChange={(e) => saveFeedback(item, e.target.value as FeedbackStatus)}
                        disabled={savingId === item.id}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                      >
                        {STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 text-xs text-gray-400">
                        Hozir: {statusLabel(item.status)}
                      </div>
                    </Td>

                    <Td className="min-w-64">
                      <textarea
                        value={noteDrafts[item.id] ?? ""}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        rows={3}
                        placeholder="Ichki izoh..."
                        className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </Td>

                    <Td className="min-w-32">
                      <button
                        onClick={() => saveFeedback(item)}
                        disabled={savingId === item.id}
                        className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingId === item.id ? "Saqlanmoqda..." : "Saqlash"}
                      </button>
                    </Td>
                  </Tr>
                );
              })
            )}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}
