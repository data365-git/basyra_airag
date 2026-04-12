"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { getPendingScans, deleteScan, getPendingCount } from "@/lib/db/offline";
import { useServerStatus } from "@/hooks/useServerStatus";
import { useTranslation } from "@/providers/LanguageProvider";

/**
 * Syncs the offline scan queue by replaying each entry through /api/scan.
 *
 * Why /api/scan instead of the old /api/attendance/sync batch endpoint?
 * The batch endpoint's `if (!existing) { create }` logic silently skips every
 * queued scan because system-generated absent records are always present. The
 * /api/scan route has the correct state machine: system-absent → silent update,
 * needs_confirmation → force-override (the offline scan physically happened),
 * excused / not-enrolled → discard from queue.
 *
 * Sync stops on the first network error (still offline).
 * Entries that get a 5xx response are kept for the next retry.
 * All other responses (2xx, 4xx) are removed — either recorded or unrecoverable.
 */
export function useOfflineSync() {
  const { t } = useTranslation();
  const { isServerOnline } = useServerStatus();
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
      if (pending.length === 0) return;

      let syncedCount = 0;

      for (const entry of pending) {
        // ── Attempt initial scan (let server decide) ─────────────────────────
        let res: Response;
        try {
          res = await fetch("/api/scan", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              token:         entry.qrToken,
              sessionId:     entry.sessionId,
              scannedAt:     entry.scannedAt,   // preserve original scan time
              forceOverride: false,
            }),
          });
        } catch {
          // Network failure — still offline, stop trying
          break;
        }

        // ── 409 needs_confirmation: offline scan physically happened → force ──
        if (res.status === 409) {
          try {
            res = await fetch("/api/scan", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                token:         entry.qrToken,
                sessionId:     entry.sessionId,
                scannedAt:     entry.scannedAt,
                forceOverride: true,
              }),
            });
          } catch {
            break; // network failure on retry
          }
        }

        // ── 5xx: transient server error — keep in queue ───────────────────────
        if (res.status >= 500) continue;

        // ── 401: auth expired — stop sync, user needs to log in ───────────────
        if (res.status === 401) break;

        // ── Everything else (2xx, other 4xx): remove from queue ───────────────
        // 200 success/late/excused/not_enrolled → recorded or legitimately skipped
        // 400 bad request / 404 session not found → unrecoverable, discard
        if (entry.id !== undefined) {
          await deleteScan(entry.id);
          if (res.ok) syncedCount++;
        }
      }

      await refreshCount();
      if (syncedCount > 0) {
        toast.success(t("scanner.synced_count", { n: String(syncedCount) }));
      }
    } catch (err) {
      console.error("Offline sync error:", err);
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshCount, t]);

  // Load initial count on mount
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // Auto-sync when server comes back online and there are pending scans
  useEffect(() => {
    if (isServerOnline && pendingCount > 0) {
      syncPending();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServerOnline]);

  return {
    isOnline:  isServerOnline,  // OfflineBanner reads this for the UI indicator
    pendingCount,
    syncing,
    syncPending,
    refreshCount,
  };
}
