"use client";

import { type FormEvent, useEffect, useState } from "react";

type MessageType = "new_lesson" | "system" | "other";
type Segment = "all" | "active" | "inactive" | "training" | "homework_pending";

type TrainingOption = {
  id: string;
  name: string;
  status: string;
};

type BroadcastPreview = {
  segment: Segment;
  trainingId: string | null;
  total: number;
  trainings: TrainingOption[];
  history?: BroadcastHistoryEntry[];
};

type BroadcastHistoryEntry = {
  id: string;
  message: string;
  type: string;
  segment: string;
  trainingId: string | null;
  total: number;
  sent: number;
  failed: number;
  errorSummary: Record<string, number> | null;
  createdById: string | null;
  createdAt: string;
};

const TEMPLATES: Record<MessageType, string> = {
  new_lesson:
    "📚 <b>Yangi dars qo'shildi!</b>\n\nSizning kursizga yangi dars materiallar qo'shildi. Iltimos, LMS tizimiga kirib ko'ring.",
  system:
    "⚙️ <b>Tizim xabari</b>\n\nHurmatli foydalanuvchi, tizimda texnik ishlar olib boriladi. Noqulaylik uchun uzr so'raymiz.",
  other: "",
};

const TYPE_LABELS: Record<MessageType, string> = {
  new_lesson: "Yangi dars qo'shildi",
  system: "Tizim xabari",
  other: "Boshqa",
};

const SEGMENT_LABELS: Record<Segment, string> = {
  all: "Barcha bot foydalanuvchilari",
  active: "Faol foydalanuvchilar",
  inactive: "Nofaol/bloklangan foydalanuvchilar",
  training: "Training ishtirokchilari",
  homework_pending: "Uy vazifasi topshirmaganlar",
};

interface Toast {
  message: string;
  ok: boolean;
}

function getTypeLabel(value: string) {
  return value in TYPE_LABELS ? TYPE_LABELS[value as MessageType] : value;
}

function getSegmentLabel(value: string) {
  return value in SEGMENT_LABELS ? SEGMENT_LABELS[value as Segment] : value;
}

function formatHistoryDate(value: string) {
  return new Date(value).toLocaleString("uz", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateMessage(value: string) {
  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function TelegramPreview({ message }: { message: string }) {
  if (!message.trim()) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-gray-400">
        Xabar kiriting…
      </div>
    );
  }

  // Very light HTML → display rendering: bold, italic, newlines
  const rendered = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // re-allow <b> and <i> tags after escaping
    .replace(/&lt;b&gt;/g, "<strong>")
    .replace(/&lt;\/b&gt;/g, "</strong>")
    .replace(/&lt;i&gt;/g, "<em>")
    .replace(/&lt;\/i&gt;/g, "</em>")
    .replace(/\n/g, "<br />");

  return (
    <div className="bg-[#effdde] rounded-2xl rounded-br-sm px-4 py-3 max-w-xs shadow-sm text-sm text-gray-900 leading-relaxed">
      <span dangerouslySetInnerHTML={{ __html: rendered }} />
      <p className="text-right text-[10px] text-gray-400 mt-1 select-none">
        {new Date().toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

export default function ChatbotBroadcastPage() {
  const [type, setType] = useState<MessageType>("new_lesson");
  const [message, setMessage] = useState(TEMPLATES.new_lesson);
  const [segment, setSegment] = useState<Segment>("all");
  const [trainingId, setTrainingId] = useState("");
  const [trainings, setTrainings] = useState<TrainingOption[]>([]);
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [history, setHistory] = useState<BroadcastHistoryEntry[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const needsTraining = segment === "training";
  const showsTrainingSelect = segment === "training" || segment === "homework_pending";
  const previewMatches =
    preview?.segment === segment && preview.trainingId === (trainingId || null);

  function handleTypeChange(t: MessageType) {
    setType(t);
    setMessage(TEMPLATES[t]);
  }

  function handleSegmentChange(next: Segment) {
    setSegment(next);
    setPreview(null);
  }

  async function fetchPreview(nextSegment = segment, nextTrainingId = trainingId) {
    if (nextSegment === "training" && !nextTrainingId) {
      setToast({ message: "Avval training tanlang", ok: false });
      return;
    }

    setPreviewing(true);
    setToast(null);

    const params = new URLSearchParams({ segment: nextSegment });
    if (nextTrainingId) params.set("trainingId", nextTrainingId);

    try {
      const res = await fetch(`/api/chatbot/broadcast?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setToast({ message: data.error ?? "Preview xatosi", ok: false });
        return;
      }

      setTrainings(data.trainings ?? []);
      setPreview(data);
      setHistory(data.history ?? []);
    } catch {
      setToast({ message: "Preview uchun tarmoq xatosi", ok: false });
    } finally {
      setPreviewing(false);
    }
  }

  useEffect(() => {
    void fetchPreview("all", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() || sending || !previewMatches) return;

    setSending(true);
    setToast(null);

    try {
      const res = await fetch("/api/chatbot/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, type, segment, trainingId: trainingId || undefined }),
      });

      const data = await res.json();

      if (res.ok) {
        setToast({
          message: `${data.sent}/${data.total} ta yuborildi${
            data.failed > 0 ? `, ${data.failed} ta xato` : ""
          }`,
          ok: true,
        });
        setPreview({ segment, trainingId: trainingId || null, total: data.total, trainings });
        if (data.historyEntry) {
          setHistory((current) => [data.historyEntry, ...current].slice(0, 20));
        }
      } else {
        setToast({ message: data.error ?? "Xato yuz berdi", ok: false });
      }
    } catch {
      setToast({ message: "Tarmoq xatosi", ok: false });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Broadcast</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tanlangan bot foydalanuvchilariga xabar yuborish
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
            toast.ok
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Message type */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Xabar turi
            </p>
            <div className="space-y-2">
              {(["new_lesson", "system", "other"] as MessageType[]).map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={type === t}
                    onChange={() => handleTypeChange(t)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{TYPE_LABELS[t]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Segment */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Qabul qiluvchilar
            </p>
            <select
              value={segment}
              onChange={(e) => handleSegmentChange(e.target.value as Segment)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {(["all", "active", "inactive", "training", "homework_pending"] as Segment[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {SEGMENT_LABELS[s]}
                  </option>
                )
              )}
            </select>

            {showsTrainingSelect && (
              <select
                value={trainingId}
                onChange={(e) => {
                  setTrainingId(e.target.value);
                  setPreview(null);
                }}
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">
                  {needsTraining ? "Training tanlang" : "Barcha traininglar"}
                </option>
                {trainings.map((training) => (
                  <option key={training.id} value={training.id}>
                    {training.name} ({training.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Textarea */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Xabar matni (HTML teglari: &lt;b&gt;, &lt;i&gt;)
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder="Xabar yozing…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-xs text-gray-400 mt-1">
              {message.length} belgi
            </p>
          </div>

          {/* Recipient preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">
              Preview
            </p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">
              {previewMatches ? `${preview.total} ta qabul qiluvchi` : "Preview kerak"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {SEGMENT_LABELS[segment]}
            </p>
            <button
              type="button"
              onClick={() => fetchPreview()}
              disabled={previewing || (needsTraining && !trainingId)}
              className="mt-3 w-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
            >
              {previewing ? "Tekshirilmoqda…" : "Qabul qiluvchilarni preview qilish"}
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={sending || !message.trim() || !previewMatches}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-xl px-4 py-3 transition-colors"
          >
            {sending ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Yuborilmoqda…
              </>
            ) : (
              `Yuborish${previewMatches ? ` (${preview.total} ta)` : ""}`
            )}
          </button>
        </form>

        {/* Live preview */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Telegram ko&apos;rinishi
          </p>
          <div className="bg-[#e5ddd5] rounded-2xl p-4 min-h-[220px] flex items-start">
            <TelegramPreview message={message} />
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Taxminiy ko&apos;rinish (HTML teglari render qilinadi)
          </p>
        </div>
      </div>

      <div className="mt-8 bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Broadcast history</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Last {history.length} schema-backed broadcast records
          </p>
        </div>

        {history.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No broadcast history yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.map((entry) => {
              const errors = entry.errorSummary ? Object.entries(entry.errorSummary) : [];

              return (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {getTypeLabel(entry.type)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {getSegmentLabel(entry.segment)}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-gray-400">
                      {formatHistoryDate(entry.createdAt)}
                    </p>
                  </div>

                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                    {truncateMessage(entry.message)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">
                      Total: {entry.total}
                    </span>
                    <span className="rounded-full bg-green-50 px-2 py-1 text-green-700">
                      Sent: {entry.sent}
                    </span>
                    <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                      Failed: {entry.failed}
                    </span>
                  </div>

                  {errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-600">
                      {errors.slice(0, 2).map(([error, count]) => (
                        <p key={error}>
                          {count}x {error}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
