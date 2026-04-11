"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Edit2 } from "lucide-react";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResultOverlay } from "@/components/scanner/ScanResult";
import { OfflineBanner } from "@/components/scanner/OfflineBanner";
import { queueScan } from "@/lib/db/offline";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import { formatTime } from "@/lib/utils";
import type { ScanResult } from "@/types";

export default function ScannerPage() {
  const canScan = usePermission("scanner", "view");
  const { isOnline, refreshCount } = useOfflineSync();
  const { t } = useTranslation();

  const [trainings, setTrainings]           = useState<any[]>([]);
  const [sessions, setSessions]             = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining] = useState("");
  const [selectedSession, setSelectedSession]   = useState("");
  const [scanResult, setScanResult]         = useState<ScanResult | null>(null);

  // Auto-select state
  const [autoContext, setAutoContext]   = useState<{ training: { id: string; name: string }; session: { id: string; session_number: number; session_date: string; session_time: string } } | null>(null);
  const [manualOverride, setManualOverride] = useState(false); // user tapped "edit" chip

  const lastScannedRef     = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  // Effective selections — auto context wins unless user has overridden
  const effectiveSession  = manualOverride ? selectedSession : (autoContext?.session.id ?? selectedSession);
  const effectiveTraining = manualOverride ? selectedTraining : (autoContext?.training.id ?? selectedTraining);

  useEffect(() => {
    // Try auto-select first; load full dropdown data in parallel for fallback
    loadContext();
    loadTrainings();
  }, []);

  useEffect(() => {
    if (manualOverride && selectedTraining) loadSessions(selectedTraining);
  }, [selectedTraining, manualOverride]);

  async function loadContext() {
    try {
      const data = await fetch("/api/scanner/context").then((r) => r.json());
      if (data.autoSelected) {
        setAutoContext(data);
      }
    } catch {
      // silently fail — fall back to manual dropdowns
    }
  }

  async function loadTrainings() {
    try {
      const data = await fetch("/api/trainings").then((r) => r.json());
      const active = (Array.isArray(data) ? data : []).filter(
        (t: any) => t.status === "active" || t.status === "upcoming"
      );
      setTrainings(active);
      if (!autoContext && active.length === 1) setSelectedTraining(active[0].id);
    } catch {}
  }

  async function loadSessions(trainingId: string) {
    try {
      const data = await fetch(`/api/sessions?training_id=${trainingId}`).then((r) => r.json());
      const list = Array.isArray(data) ? data : [];
      setSessions(list);
      // Pre-select today's session if one exists
      const today = new Date().toISOString().slice(0, 10);
      const todaysSession = list.find((s: any) => s.session_date === today);
      if (todaysSession) setSelectedSession(todaysSession.id);
      else if (list.length === 1) setSelectedSession(list[0].id);
    } catch {}
  }

  const handleScan = useCallback(async (token: string) => {
    const now = Date.now();
    if (token === lastScannedRef.current && now - lastScannedTimeRef.current < 3000) return;
    lastScannedRef.current     = token;
    lastScannedTimeRef.current = now;

    setScanResult(null);

    if (!effectiveSession) {
      setScanResult({ type: "unknown", message: t("scanner.session_required") });
      navigator.vibrate?.([100, 50, 100]);
      return;
    }

    if (!isOnline) {
      await queueScan({ sessionId: effectiveSession, qrToken: token, scannedAt: new Date().toISOString() });
      await refreshCount();
      setScanResult({ type: "success" });
      navigator.vibrate?.(200);
      return;
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sessionId: effectiveSession }),
      });
      const data = (await res.json()) as ScanResult;
      setScanResult(data);
      if (data.type === "success" || data.type === "late") {
        navigator.vibrate?.(200);
      } else {
        navigator.vibrate?.([100, 50, 100]);
      }
    } catch {
      if (!navigator.onLine) {
        await queueScan({ sessionId: effectiveSession, qrToken: token, scannedAt: new Date().toISOString() });
        await refreshCount();
        setScanResult({ type: "success" });
        navigator.vibrate?.(200);
      } else {
        setScanResult({ type: "unknown", message: t("scanner.network_error") });
        navigator.vibrate?.([100, 50, 100]);
      }
    }
  }, [effectiveSession, isOnline, refreshCount, t]);

  if (!canScan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900">{t("scanner.access_denied_title")}</h2>
        <p className="text-gray-500 mt-2">{t("scanner.access_denied_hint")}</p>
      </div>
    );
  }

  const showAutoChip = !!autoContext && !manualOverride;

  return (
    <div className="fixed inset-0 z-40 lg:relative lg:z-auto lg:inset-auto flex flex-col bg-gray-900 lg:h-[calc(100vh-2rem)] lg:rounded-2xl overflow-hidden">
      <OfflineBanner />

      {/* Session selector */}
      <div className="bg-gray-800 px-4 py-3 flex gap-2 z-10">
        {showAutoChip ? (
          /* Auto-selected chip */
          <div className="flex-1 flex items-center justify-between bg-blue-600/30 border border-blue-500/50 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{autoContext.training.name}</p>
              <p className="text-blue-300 text-xs">
                {t("scanner.today")} · {formatTime(autoContext.session.session_time)}
              </p>
            </div>
            <button
              onClick={() => {
                setManualOverride(true);
                // Pre-select the auto-selected training in manual dropdowns
                setSelectedTraining(autoContext.training.id);
                setSelectedSession(autoContext.session.id);
                loadSessions(autoContext.training.id);
              }}
              className="ml-2 p-1.5 rounded-md hover:bg-white/10 text-blue-300 hover:text-white transition-colors shrink-0"
              aria-label="Override selection"
            >
              <Edit2 size={14} />
            </button>
          </div>
        ) : (
          /* Manual dropdowns */
          <>
            <select
              value={selectedTraining}
              onChange={(e) => {
                setSelectedTraining(e.target.value);
                setSelectedSession("");
                setScanResult(null);
              }}
              className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t("scanner.select_training")}</option>
              {trainings.map((tr) => (
                <option key={tr.id} value={tr.id}>{tr.name}</option>
              ))}
            </select>
            <select
              value={selectedSession}
              onChange={(e) => { setSelectedSession(e.target.value); setScanResult(null); }}
              disabled={!selectedTraining}
              className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">{t("scanner.select_session")}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {t("trainings.session_number", { n: s.session_number })} — {s.session_date}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Camera area */}
      <div className="flex-1 relative overflow-hidden">
        <QRScanner onScan={handleScan} active={!!effectiveSession} />

        {/* No session selected */}
        {!effectiveSession && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center bg-gray-900/80">
            <div className="text-4xl mb-4">📱</div>
            <p className="text-lg font-medium">{t("scanner.select_to_scan")}</p>
            <p className="text-sm text-white/60 mt-1">{t("scanner.select_to_scan_sub")}</p>
          </div>
        )}

        <ScanResultOverlay result={scanResult} isOffline={!isOnline} />
      </div>

      {/* Bottom hint bar */}
      <div className="bg-gray-800 px-4 py-3 text-center">
        <p className="text-white/70 text-sm">
          {!effectiveSession
            ? t("scanner.select_above")
            : scanResult
              ? t("scanner.scan_next")
              : t("scanner.point_camera")}
        </p>
      </div>
    </div>
  );
}
