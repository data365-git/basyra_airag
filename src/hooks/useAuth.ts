"use client";

import { useEffect, useState, useCallback } from "react";
import type { StaffUser } from "@/types";

export function useAuth() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = res.ok ? await res.json() : null;
      setUser(data as StaffUser | null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Re-validate when the tab regains focus (catches mid-session deactivation / role changes)
  useEffect(() => {
    const onFocus = () => { refetch(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  return { user, loading, refetch };
}
