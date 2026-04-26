"use client";

import { useEffect, useState } from "react";

type Settings = Record<string, string>;

const TTS_VOICES = [
  "Aoede",
  "Charon",
  "Fenrir",
  "Kore",
  "Puck",
  "Schedar",
  "Umbriel",
  "Zubenelgenubi",
];

const TTS_MODELS = ["gemini-2.5-flash-preview-tts"];

function useSettings() {
  const [settings, setSettings] = useState<Settings>({});
  const [original, setOriginal] = useState<Settings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/chatbot/settings")
      .then((r) => r.json())
      .then((data: Settings) => {
        setSettings(data);
        setOriginal(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function set(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return { settings, original, set, loading };
}

async function patchSetting(key: string, value: string) {
  const res = await fetch("/api/chatbot/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return res.ok;
}

interface SaveState {
  saving: boolean;
  error: string | null;
  success: boolean;
}

export default function ChatbotSettingsPage() {
  const { settings, original, set, loading } = useSettings();
  const [save, setSave] = useState<SaveState>({
    saving: false,
    error: null,
    success: false,
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSave({ saving: true, error: null, success: false });

    const changed = Object.entries(settings).filter(
      ([k, v]) => original[k] !== v
    );
    // Also include keys set in the form that didn't exist originally
    const allKeys = Object.keys(settings);
    const newKeys = allKeys.filter((k) => !(k in original) && settings[k] !== "");
    const toSave = [
      ...changed,
      ...newKeys.map((k): [string, string] => [k, settings[k]]),
    ];

    const dedupedKeys = [...new Set(toSave.map(([k]) => k))];
    const deduped = dedupedKeys.map((k) => [k, settings[k]] as [string, string]);

    let allOk = true;
    for (const [key, value] of deduped) {
      const ok = await patchSetting(key, value);
      if (!ok) allOk = false;
    }

    if (allOk) {
      setSave({ saving: false, error: null, success: true });
      setTimeout(() => setSave((s) => ({ ...s, success: false })), 3000);
    } else {
      setSave({ saving: false, error: "Ba'zi sozlamalar saqlanmadi", success: false });
    }
  }

  const ttsVerified = settings["bot.tts_prices_verified"] === "true";

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-400">Yuklanmoqda…</div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Bot sozlamalari</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Chatbot xarajat chegaralari, TTS va RAG konfiguratsiyasi
        </p>
      </div>

      {/* TTS prices warning */}
      {!ttsVerified && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
          <span className="text-amber-500 text-lg leading-none">⚠️</span>
          <p className="text-sm text-amber-800">
            TTS narxlari tasdiqlanmagan. Kutilmagan xarajatlardan qochish uchun
            ularni tekshirib, pastdagi katakchani belgilang.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Cost Alerts */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span>💰</span> Xarajat ogohlantirishlari
          </h2>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4 shadow-sm">
            <FieldRow label="Kunlik limit (USD)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={settings["bot.cost.daily_limit_usd"] ?? "5"}
                onChange={(e) => set("bot.cost.daily_limit_usd", e.target.value)}
                className={inputCls}
                placeholder="5.00"
              />
            </FieldRow>
            <FieldRow label="Oylik limit (USD)">
              <input
                type="number"
                min={0}
                step={1}
                value={settings["bot.cost.monthly_limit_usd"] ?? "50"}
                onChange={(e) => set("bot.cost.monthly_limit_usd", e.target.value)}
                className={inputCls}
                placeholder="50"
              />
            </FieldRow>
            <FieldRow label="Ogohlantirish Telegram ID">
              <input
                type="text"
                value={settings["bot.cost.alert_recipient_chat_id"] ?? ""}
                onChange={(e) =>
                  set("bot.cost.alert_recipient_chat_id", e.target.value)
                }
                className={inputCls}
                placeholder="123456789"
              />
            </FieldRow>
          </div>
        </section>

        {/* TTS Configuration */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span>🔊</span> TTS konfiguratsiyasi
          </h2>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4 shadow-sm">
            <FieldRow label="Model">
              <select
                value={settings["bot.tts.model"] ?? TTS_MODELS[0]}
                onChange={(e) => set("bot.tts.model", e.target.value)}
                className={inputCls}
              >
                {TTS_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Ovoz (Voice)">
              <select
                value={settings["bot.tts.voice"] ?? "Aoede"}
                onChange={(e) => set("bot.tts.voice", e.target.value)}
                className={inputCls}
              >
                {TTS_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="TTS narxlari tasdiqlangan?">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ttsVerified}
                  onChange={(e) =>
                    set("bot.tts_prices_verified", e.target.checked ? "true" : "false")
                  }
                  className="accent-indigo-600 w-4 h-4"
                />
                <span className="text-sm text-gray-700">
                  Ha, narxlarni tekshirdim
                </span>
              </label>
            </FieldRow>
          </div>
        </section>

        {/* RAG Behavior */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span>📚</span> RAG xatti-harakati
          </h2>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4 shadow-sm">
            <FieldRow label="Top-K bo'laklar">
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={settings["bot.rag.top_k"] ?? "5"}
                onChange={(e) => set("bot.rag.top_k", e.target.value)}
                className={inputCls}
                placeholder="5"
              />
            </FieldRow>
            <FieldRow label="Minimal o'xshashlik (0.0–1.0)">
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={settings["bot.rag.min_similarity"] ?? "0.7"}
                onChange={(e) => set("bot.rag.min_similarity", e.target.value)}
                className={inputCls}
                placeholder="0.70"
              />
            </FieldRow>
          </div>
        </section>

        {/* LLM model (shown for completeness) */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span>🤖</span> LLM modeli
          </h2>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <FieldRow label="Chat modeli">
              <input
                type="text"
                value={settings["bot.llm.chat_model"] ?? ""}
                onChange={(e) => set("bot.llm.chat_model", e.target.value)}
                className={inputCls}
                placeholder="gemini-2.5-flash"
              />
            </FieldRow>
          </div>
        </section>

        {/* Save feedback */}
        {save.error && (
          <p className="text-sm text-red-600">{save.error}</p>
        )}
        {save.success && (
          <p className="text-sm text-green-600">Sozlamalar saqlandi ✓</p>
        )}

        {/* Save button */}
        <button
          type="submit"
          disabled={save.saving}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-xl px-4 py-3 transition-colors"
        >
          {save.saving ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
              Saqlanmoqda…
            </>
          ) : (
            "Saqlash"
          )}
        </button>
      </form>
    </div>
  );
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300";

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
      <label className="text-sm text-gray-500 sm:w-52 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
