"use client";

import { RefreshCw } from "lucide-react";

export default function ScannerError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-white text-xl font-bold">Xatolik yuz berdi</p>
      <p className="text-gray-400 text-sm">Scanner failed to load</p>

      {/* Show the real error so we know what to fix */}
      {error?.message && (
        <div className="w-full max-w-sm bg-red-900/40 border border-red-700/50 rounded-xl p-3 text-left">
          <p className="text-red-300 text-xs font-mono break-words">{error.message}</p>
          {error?.stack && (
            <p className="text-red-400/60 text-xs font-mono mt-1 break-words">
              {error.stack.split("\n")[1]?.trim() ?? ""}
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
      >
        <RefreshCw size={18} />
        Qayta yuklash / Reload
      </button>
    </div>
  );
}
