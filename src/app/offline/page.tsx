"use client";

import { WifiOff, RefreshCw } from "lucide-react";

/**
 * Shown by the service worker when the user is offline AND the requested
 * page is not in the SW cache (i.e. after a new deploy invalidated old assets).
 *
 * Must be a static page — no data fetching, no auth, no i18n provider,
 * because none of those are available when SW renders this fallback.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8 text-center">
      <WifiOff size={56} className="text-gray-500 mb-6" />

      <h1 className="text-2xl font-bold text-white mb-2">
        Sahifa yuklanmadi
      </h1>
      <p className="text-gray-400 text-sm mb-1">Page couldn&apos;t load</p>
      <p className="text-gray-500 text-xs mb-8 max-w-xs">
        Ilovani yangilang yoki internet aloqasini tekshiring.
        <br />
        Reload the page or check your connection.
      </p>

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
