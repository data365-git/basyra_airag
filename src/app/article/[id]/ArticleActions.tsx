"use client";

import { useEffect, useState } from "react";

export function ArticleActions({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [canSpeak] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function handleListen() {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();

    if (speaking) {
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 12000));
    utterance.lang = "uz-UZ";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="no-print mt-7 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleListen}
        disabled={!canSpeak}
        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {speaking ? "To'xtatish" : "Listen"}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
      >
        Download PDF
      </button>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(window.location.href)}
        className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
      >
        Copy link
      </button>
    </div>
  );
}
