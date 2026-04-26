"use client";

import { useEffect, useState } from "react";

type MessageType = "new_lesson" | "system" | "other";

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

interface Toast {
  message: string;
  ok: boolean;
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
      {/* eslint-disable-next-line react/no-danger */}
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
  const [userCount, setUserCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Fetch total user count once
  useEffect(() => {
    fetch("/api/chatbot/users")
      .then((r) => r.json())
      .then((data) => setUserCount(data.total ?? null))
      .catch(() => null);
  }, []);

  function handleTypeChange(t: MessageType) {
    setType(t);
    setMessage(TEMPLATES[t]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || sending) return;

    setSending(true);
    setToast(null);

    try {
      const res = await fetch("/api/chatbot/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, type }),
      });

      const data = await res.json();

      if (res.ok) {
        setToast({
          message: `${data.sent} ta yuborildi${data.failed > 0 ? `, ${data.failed} ta xato` : ""}`,
          ok: true,
        });
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
          Barcha bot foydalanuvchilariga xabar yuborish
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

          {/* Recipient info */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">
              Qancha foydalanuvchiga?
            </p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">
              {userCount === null ? "—" : `${userCount} ta`}
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={sending || !message.trim()}
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
              `Yuborish${userCount !== null ? ` (${userCount} ta foydalanuvchi)` : ""}`
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
    </div>
  );
}
