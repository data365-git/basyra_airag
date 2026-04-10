"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { getPendingScans, markSynced, clearSynced, getPendingCount } from "@/lib/db/offline";
import { useOnlineStatus } from "./useOnlineStatus";

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  const syncPending = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);

    try {
      const pending = await getPendingScans();
      if (pending.length === 0) {
        setSyncing(false);
        return;
      }

      const response = await fetch("/api/attendance/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scans: pending }),
      });

      if (response.ok) {
        const result: { synced: number; errors: string[] } = await response.json();

        const syncedIds = pending
          .map((s) => s.id)
          .filter((id): id is number => id !== undefined);
        await markSynced(syncedIds);
        await clearSynced();
        await refreshCount();

        if (result.synced > 0) {
          toast.success(
            `${result.synced} offline scan${result.synced === 1 ? "" : "s"} synced successfully`
          );
        }
        if (result.errors?.length > 0) {
          toast.error(
            `${result.errors.length} scan${result.errors.length === 1 ? "" : "s"} failed to sync`
          );
        }
      } else {
        toast.error("Offline sync failed — will retry when online");
      }
    } catch (error) {
      console.error("Sync failed:", error);
      toast.error("Offline sync failed — will retry when online");
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshCount]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPending();
    }
  }, [isOnline, pendingCount, syncPending]);

  return { isOnline, pendingCount, syncing, syncPending, refreshCount };
}
