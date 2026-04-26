"use client";

import { useEffect, useState } from "react";

type Settings = Record<string, string>;

interface TestChatResult {
  answer: string;
  ok: boolean;
  metadata: Record<string, unknown>;
  error?: string;
}

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
  const [testQuestion, setTestQuestion] = useState("");
  const [testResult, setTestResult] = useState<TestChatResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

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

  async function handleTestChat(e: React.FormEvent) {
    e.preventDefault();
    const question = testQuestion.trim();
    if (!question) {
      setTestError("Savol kiriting");
      setTestResult(null);
      return;
    }

    setTestLoading(true);
    setTestError(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/chatbot/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();

      if (!res.ok) {
        setTestError(data.error ?? "Test chat ishlamadi");
        return;
      }

      setTestResult(data as TestChatResult);
    } catch {
      setTestError("Test chat so'rovida xatolik yuz berdi");
    } finally {
      setTestLoading(false);
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
            <FieldRow label="Long answer threshold (chars)">
              <input
                type="number"
                min={100}
                max={10000}
                step={50}
                value={settings["bot.long_answer.threshold_chars"] ?? "3900"}
                onChange={(e) =>
                  set("bot.long_answer.threshold_chars", e.target.value)
                }
                className={inputCls}
                placeholder="1200"
              />
            </FieldRow>
            <FieldRow label="TTS chunk size (chars)">
              <input
                type="number"
                min={100}
                max={5000}
                step={50}
                value={settings["bot.tts.chunk_size_chars"] ?? "400"}
                onChange={(e) => set("bot.tts.chunk_size_chars", e.target.value)}
                className={inputCls}
                placeholder="400"
              />
            </FieldRow>
            <FieldRow label="TTS concurrency">
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={settings["bot.tts.concurrency"] ?? "2"}
                onChange={(e) => set("bot.tts.concurrency", e.target.value)}
                className={inputCls}
                placeholder="2"
              />
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

        {/* Prompt Settings */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span>[ ]</span> Prompt sozlamalari
          </h2>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4 shadow-sm">
            <FieldRow label="System prompt">
              <textarea
                value={settings["bot.prompt.system"] ?? ""}
                onChange={(e) => set("bot.prompt.system", e.target.value)}
                className={`${inputCls} min-h-28 resize-y`}
                placeholder="Bot uchun umumiy system prompt"
              />
            </FieldRow>
            <FieldRow label="Admin instruction">
              <textarea
                value={settings["bot.prompt.admin_instruction"] ?? ""}
                onChange={(e) =>
                  set("bot.prompt.admin_instruction", e.target.value)
                }
                className={`${inputCls} min-h-28 resize-y`}
                placeholder="Admin test yoki ichki yo'riqnoma"
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

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Admin test chat
        </h2>
        <form
          onSubmit={handleTestChat}
          className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4 shadow-sm"
        >
          <div>
            <label className="block text-sm text-gray-500 mb-1.5">
              Test savol
            </label>
            <textarea
              value={testQuestion}
              onChange={(e) => setTestQuestion(e.target.value)}
              className={`${inputCls} min-h-24 resize-y`}
              placeholder="Botga savol yozing..."
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Bu test Telegramga hech narsa yubormaydi.
            </p>
          </div>

          <button
            type="submit"
            disabled={testLoading}
            className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400"
          >
            {testLoading ? "Tekshirilmoqda..." : "Test chatni ishga tushirish"}
          </button>

          {testError && <p className="text-sm text-red-600">{testError}</p>}

          {testResult && (
            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Javob
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                  {testResult.answer}
                </p>
              </div>
              {testResult.error && (
                <p className="text-sm text-amber-700">{testResult.error}</p>
              )}
              <details>
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Metadata
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-white p-3 text-xs text-gray-700">
                  {JSON.stringify(testResult.metadata, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </form>
      </section>
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
