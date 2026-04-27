"use client";

import { useEffect } from "react";

export default function ChatbotError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[chatbot] segment error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-xl font-semibold text-gray-900">Xatolik yuz berdi</h2>
      <p className="text-gray-500 text-sm text-center max-w-md">
        Chatbot paneli yuklanmadi. Sahifani yangilang yoki qayta urinib ko&apos;ring.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Sahifani yangilash
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
        >
          Qayta urinish
        </button>
      </div>
    </div>
  );
}
