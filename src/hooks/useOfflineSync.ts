"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { getPendingScans, markSynced, clearSynced, getPendingCount } from "@/lib/db/offline";
import { useOnlineStatus } from "./useOnlineStatus";
import { useTranslation } from "@/providers/LanguageProvider";

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const { t } = useTranslation();
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
          toast.success(t("scanner.synced_count", { n: String(result.synced) }));
        }
        if (result.errors?.length > 0) {
          toast.error(t("scanner.sync_errors", { n: String(result.errors.length) }));
        }
      } else {
        toast.error(t("scanner.sync_failed"));
      }
    } catch (error) {
      console.error("Sync failed:", error);
      toast.error(t("scanner.sync_failed"));
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
