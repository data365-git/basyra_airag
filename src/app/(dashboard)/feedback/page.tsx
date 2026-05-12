"use client";

import { useEffect, useState } from "react";

// ---- Types ----

interface FeedbackItem {
  id: string;
  created_at: string;
  category: string;
  severity: string | null;
  tags: string[];
  message_text: string;
  status: string;
  curator_note: string | null;
  participant_name: string | null;
  chat_id: string;
}

// ---- Helpers ----

const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Severity sort: HIGH first, then MEDIUM, then LOW, then null
const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
function sortBySeverity(a: FeedbackItem, b: FeedbackItem) {
  const sa = a.severity ? (SEVERITY_ORDER[a.severity] ?? 3) : 3;
  const sb = b.severity ? (SEVERITY_ORDER[b.severity] ?? 3) : 3;
  return sa - sb;
}

// ---- Inline components ----

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    COMPLAINT: { label: "🚨 Shikoyat", cls: "bg-red-100 text-red-700" },
    SUGGESTION: { label: "💡 Taklif",  cls: "bg-yellow-100 text-yellow-700" },
    PRAISE:     { label: "🌟 Maqtov",  cls: "bg-green-100 text-green-700" },
  };
  const m = map[category] ?? { label: category, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return null;
  const map: Record<string, { label: string; cls: string }> = {
    HIGH:   { label: "HIGH",   cls: "bg-red-100 text-red-700" },
    MEDIUM: { label: "MEDIUM", cls: "bg-orange-100 text-orange-700" },
    LOW:    { label: "LOW",    cls: "bg-gray-100 text-gray-500" },
  };
  const m = map[severity] ?? { label: severity, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function FeedbackCard({
  item,
  onStatusChange,
}: {
  item: FeedbackItem;
  onStatusChange: (id: string, status: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-2">
      {/* Top row: badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <CategoryBadge category={item.category} />
        <SeverityBadge severity={item.severity} />
      </div>

      {/* Participant + date */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          {item.participant_name ?? "Noma'lum foydalanuvchi"}
        </p>
        <p className="text-xs text-gray-400">{formatDate(item.created_at)}</p>
      </div>

      {/* Message */}
      <p className="text-sm text-gray-800 leading-snug">{item.message_text}</p>

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {item.status === "new" && (
          <button
            onClick={() => onStatusChange(item.id, "in_review")}
            className="text-xs text-amber-600 hover:underline font-medium"
          >
            → Ko&apos;rilmoqda
          </button>
        )}
        {(item.status === "new" || item.status === "in_review") && (
          <button
            onClick={() => onStatusChange(item.id, "resolved")}
            className="text-xs text-green-600 hover:underline font-medium"
          >
            ✓ Hal qilindi
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Tab config ----

const CATEGORY_TABS = [
  { key: "",           label: "Hammasi" },
  { key: "COMPLAINT",  label: "Shikoyat" },
  { key: "SUGGESTION", label: "Taklif" },
  { key: "PRAISE",     label: "Maqtov" },
];

const STATUS_TABS = [
  { key: "new",       label: "Yangi" },
  { key: "in_review", label: "Ko'rilmoqda" },
  { key: "resolved",  label: "Hal qilindi" },
];

// ---- Main page ----

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryTab, setCategoryTab] = useState("");
  const [statusTab, setStatusTab] = useState("new");

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  useEffect(() => {
    const params = new URLSearchParams({ status: statusTab });
    if (categoryTab) params.set("category", categoryTab);

    setLoading(true);
    fetch(`/api/feedback?${params}`)
      .then((r) => r.json())
      .then((data: FeedbackItem[]) => {
        setItems(data.sort(sortBySeverity));
        setLoading(false);
      });
  }, [categoryTab, statusTab]);

  function TabBar<T extends string>({
    tabs,
    active,
    onChange,
  }: {
    tabs: { key: T; label: string }[];
    active: T;
    onChange: (key: T) => void;
  }) {
    return (
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
              active === tab.key
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Fikr-mulohazalar</h1>
        <p className="text-sm text-gray-500 mt-1">
          O&apos;quvchilardan kelgan shikoyat, taklif va maqtovlar
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <TabBar
          tabs={CATEGORY_TABS}
          active={categoryTab}
          onChange={setCategoryTab}
        />
        <TabBar
          tabs={STATUS_TABS}
          active={statusTab}
          onChange={setStatusTab}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">
          Yuklanmoqda...
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-400 py-12 text-center">
          Fikr-mulohazalar topilmadi
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
