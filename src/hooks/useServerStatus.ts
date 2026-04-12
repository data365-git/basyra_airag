"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const HEALTH_URL     = "/api/health";
const CHECK_INTERVAL = 15_000; // re-ping every 15 s while page is open
const CACHE_TTL      = 5_000;  // treat a recent ping as still valid for 5 s
const TIMEOUT_MS     = 3_000;  // give up if server doesn't respond in 3 s

/**
 * Returns a real server-reachability state, NOT navigator.onLine.
 *
 * - Pings /api/health immediately on mount.
 * - Re-pings every CHECK_INTERVAL ms.
 * - Also re-pings when the `online` browser event fires (best of both worlds).
 * - Exposes `checkNow()` so the scanner can probe right before submitting a scan.
 *
 * `isServerOnline` is what callers should use — not navigator.onLine.
 */
export function useServerStatus() {
  const [isServerOnline, setIsServerOnline] = useState(true); // optimistic default
  const lastCheckTime = useRef<number>(0);
  const lastResult    = useRef<boolean>(true);

  const ping = useCallback(async (): Promise<boolean> => {
    const now = Date.now();
    // Return cached result if the last check was very recent
    if (now - lastCheckTime.current < CACHE_TTL) {
      return lastResult.current;
    }

    try {
      const res = await fetch(HEALTH_URL, {
        method: "HEAD",
        cache:  "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const reachable = res.ok;
      lastCheckTime.current = Date.now();
      lastResult.current    = reachable;
      setIsServerOnline(reachable);
      return reachable;
    } catch {
      lastCheckTime.current = Date.now();
      lastResult.current    = false;
      setIsServerOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    // Immediate check on mount
    ping();

    // Periodic re-check
    const interval = setInterval(ping, CHECK_INTERVAL);

    // Also re-check when browser thinks it came back online
    const handleOnline = () => {
      // Force a fresh check by resetting cache time
      lastCheckTime.current = 0;
      ping();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", () => {
      // Browser is certain it's offline — trust this immediately
      setIsServerOnline(false);
      lastResult.current = false;
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
    };
  }, [ping]);

  return { isServerOnline, checkNow: ping };
}
