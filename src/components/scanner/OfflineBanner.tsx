"use client";

import { WifiOff, RefreshCw } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { isOnline, pendingCount, syncing, syncPending } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium",
        isOnline && pendingCount > 0
          ? "bg-blue-600 text-white"
          : "bg-orange-500 text-white"
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff size={16} className="shrink-0" />
          <span>Offline mode — {pendingCount} scan{pendingCount !== 1 ? "s" : ""} queued locally</span>
        </>
      ) : (
        <>
          <RefreshCw size={16} className={cn("shrink-0", syncing && "animate-spin")} />
          <span>{syncing ? "Syncing..." : `${pendingCount} scan${pendingCount !== 1 ? "s" : ""} pending sync`}</span>
          {!syncing && (
            <button onClick={syncPending} className="ml-auto underline text-xs">Sync now</button>
          )}
        </>
      )}
    </div>
  );
}
