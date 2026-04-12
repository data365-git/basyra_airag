"use client";

import { RefreshCw } from "lucide-react";

export default function ScannerError({ reset }: { reset: () => void }) {
  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-white text-xl font-bold">Xatolik yuz berdi</p>
      <p className="text-gray-400 text-sm">Scanner failed to load</p>
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
