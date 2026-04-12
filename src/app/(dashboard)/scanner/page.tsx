"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Edit2, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResultOverlay } from "@/components/scanner/ScanResult";
import { OfflineBanner } from "@/components/scanner/OfflineBanner";
import { queueScan } from "@/lib/db/offline";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useServerStatus } from "@/hooks/useServerStatus";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import { formatTime } from "@/lib/utils";
import {
  getSessionState,
  getSessionWindow,
  secondsUntilOpen,
  formatCountdown,
  DEFAULT_WINDOW_BEFORE,
  DEFAULT_WINDOW_AFTER,
} from "@/lib/sessionWindow";
import type { ScanResult, SessionState } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutoContext {
  training:  { id: string; name: string };
  session:   {
    id:                 string;
    session_number:     number;
    session_date:       string;
    session_time:       string;
    scan_window_before: number;
    scan_window_after:  number;
  };
  state: SessionState;
}

// ─── Countdown component ──────────────────────────────────────────────────────

function CountdownBlock({
  secondsLeft,
  label,
}: {
  secondsLeft: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 text-yellow-400 mb-1">
        <Clock size={20} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="font-mono text-4xl font-bold text-white tracking-widest">
        {formatCountdown(secondsLeft)}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const canScan = usePermission("scanner", "view");
  const { pendingCount, refreshCount, syncPending } = useOfflineSync();
  const { isServerOnline, checkNow } = useServerStatus();
  const { t } = useTranslation();

  // Manual dropdown state
  const [trainings, setTrainings]                   = useState<any[]>([]);
  const [sessions,  setSessions]                    = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining]     = useState("");
  const [selectedSession,  setSelectedSession]      = useState("");

  // Auto-context state
  const [autoContext,     setAutoContext]    = useState<AutoContext | null>(null);
  const [manualOverride,  setManualOverride] = useState(false);

  // Live state for the selected session
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [countdown,    setCountdown]    = useState(0);
  const [scanCount,    setScanCount]    = useState(0);

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const lastScannedRef     = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const tickRef            = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Effective selections ───────────────────────────────────────────────────
  const effectiveSession  = manualOverride ? selectedSession  : (autoContext?.session.id  ?? selectedSession);
  const effectiveTraining = manualOverride ? selectedTraining : (autoContext?.training.id ?? selectedTraining);

  // The window settings for the effective session (used by client-side timer)
  const effectiveWindowInput = autoContext && !manualOverride
    ? {
        sessionDate:      autoContext.session.session_date,
        sessionTime:      autoContext.session.session_time,
        isCancelled:      false,
        forceClosed:      false,
        scanWindowBefore: autoContext.session.scan_window_before,
        scanWindowAfter:  autoContext.session.scan_window_after,
      }
    : null;

  // ── On mount ───────────────────────────────────────────────────────────────
  useEffect(() => {
    loadContext();
    loadTrainings();
    // If there are queued scans from a previous offline session, try syncing now
    syncPending();
  }, []);

  // ── When manual override or training changes ───────────────────────────────
  useEffect(() => {
    if (manualOverride && selectedTraining) loadSessions(selectedTraining);
  }, [selectedTraining, manualOverride]);

  // ── Live session state ticker ──────────────────────────────────────────────
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!effectiveWindowInput) { setSessionState(null); return; }

    const tick = () => {
      const now   = new Date();
      const state = getSessionState(effectiveWindowInput, undefined, now);
      setSessionState(state);

      if (state === "upcoming") {
        setCountdown(secondsUntilOpen(effectiveWindowInput, undefined, now));
      } else {
        setCountdown(0);
      }
    };

    tick(); // immediate
    tickRef.current = setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [
    autoContext?.session.session_date,
    autoContext?.session.session_time,
    autoContext?.session.scan_window_before,
    autoContext?.session.scan_window_after,
    manualOverride,
  ]);

  // ── When session becomes active, load scan count ──────────────────────────
  useEffect(() => {
    if (sessionState === "active" && effectiveSession) {
      fetchScanCount(effectiveSession);
    }
  }, [sessionState, effectiveSession]);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  async function loadContext() {
    try {
      const data = await fetch("/api/scanner/context").then((r) => r.json());
      if (data.autoSelected) {
        setAutoContext(data as AutoContext);
      }
    } catch {
      // silently fail — fall back to manual dropdowns
    }
  }

  async function loadTrainings() {
    try {
      const data = await fetch("/api/trainings").then((r) => r.json());
      const active = (Array.isArray(data) ? data : []).filter(
        (tr: any) => tr.status === "active" || tr.status === "upcoming"
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
      const today = new Date().toISOString().slice(0, 10);
      const todaysSession = list.find((s: any) => s.session_date === today);
      if (todaysSession) setSelectedSession(todaysSession.id);
      else if (list.length === 1) setSelectedSession(list[0].id);
    } catch {}
  }

  async function fetchScanCount(sessionId: string) {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/attendance`);
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data) ? data.length : (data?.count ?? 0);
        setScanCount(count);
      }
    } catch {}
  }

  // ── Scan handler ───────────────────────────────────────────────────────────

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

    // ── Real connectivity check — never trust navigator.onLine alone ──────────
    // checkNow() pings /api/health with a 3 s timeout (result cached 5 s).
    // Only if that fails do we treat this scan as offline.
    const reachable = await checkNow();

    if (!reachable) {
      // Server is genuinely unreachable — queue locally, show amber screen
      await queueScan({ sessionId: effectiveSession, qrToken: token, scannedAt: new Date().toISOString() });
      await refreshCount();
      setScanResult({ type: "queued_offline" }); // amber, NOT green
      navigator.vibrate?.([100, 50, 100]);
      return;
    }

    // ── Server is reachable — call the API and wait for the real response ─────
    try {
      const res = await fetch("/api/scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, sessionId: effectiveSession }),
      });
      const data = (await res.json()) as ScanResult;
      setScanResult(data);

      if (data.type === "success" || data.type === "late") {
        navigator.vibrate?.(200);
        setScanCount((c) => c + 1);
      } else {
        navigator.vibrate?.([100, 50, 100]);
      }
    } catch {
      // fetch() threw (network dropped between health check and API call)
      // Queue it and show amber — still NOT green
      await queueScan({ sessionId: effectiveSession, qrToken: token, scannedAt: new Date().toISOString() });
      await refreshCount();
      setScanResult({ type: "queued_offline" });
      navigator.vibrate?.([100, 50, 100]);
    }
  }, [effectiveSession, checkNow, refreshCount, t]);

  // ── Access guard ───────────────────────────────────────────────────────────

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

  // ── Derive what to show in the camera area ─────────────────────────────────

  const showUpcoming    = !!effectiveSession && sessionState === "upcoming";
  const showCancelled   = !!effectiveSession && (sessionState === "cancelled" || sessionState === "force_closed");
  const showEnded       = !!effectiveSession && sessionState === "ended";
  const cameraActive    = !!effectiveSession && sessionState === "active";

  return (
    <div className="fixed inset-0 z-40 lg:relative lg:z-auto lg:inset-auto flex flex-col bg-gray-900 lg:h-[calc(100vh-2rem)] lg:rounded-2xl overflow-hidden">
      <OfflineBanner />

      {/* ── Session selector ─────────────────────────────────────────────── */}
      <div className="bg-gray-800 px-4 py-3 flex gap-2 z-10">
        {showAutoChip ? (
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

      {/* ── Camera area ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <QRScanner onScan={handleScan} active={cameraActive} />

        {/* No session selected */}
        {!effectiveSession && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center bg-gray-900/80 px-6">
            <div className="text-4xl mb-4">📱</div>
            <p className="text-lg font-medium">{t("scanner.select_to_scan")}</p>
            <p className="text-sm text-white/60 mt-1">{t("scanner.select_to_scan_sub")}</p>
          </div>
        )}

        {/* Upcoming: countdown to window open */}
        {showUpcoming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 px-6">
            <CountdownBlock
              secondsLeft={countdown}
              label={t("scanner.opens_in")}
            />
            <p className="text-white/50 text-xs mt-6">
              {autoContext
                ? `${autoContext.training.name} · ${t("scanner.session_short")} ${autoContext.session.session_number}`
                : t("scanner.session_not_started")}
            </p>
          </div>
        )}

        {/* Cancelled / force-closed */}
        {showCancelled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 px-6">
            <XCircle size={48} className="text-red-400 mb-4" />
            <p className="text-white text-lg font-medium">
              {sessionState === "cancelled"
                ? t("scanner.session_cancelled")
                : t("scanner.session_force_closed")}
            </p>
          </div>
        )}

        {/* Ended: show today's summary */}
        {showEnded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 px-6 text-center">
            <CheckCircle size={48} className="text-green-400 mb-4" />
            <p className="text-white text-lg font-medium">{t("scanner.session_ended")}</p>
            {scanCount > 0 && (
              <p className="text-white/60 text-sm mt-2">
                {t("scanner.scanned_today", { count: String(scanCount) })}
              </p>
            )}
          </div>
        )}

        {/* Active: live scan count badge */}
        {cameraActive && scanCount > 0 && (
          <div className="absolute top-3 right-3 bg-green-600/80 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
            ✓ {scanCount}
          </div>
        )}

        <ScanResultOverlay result={scanResult} isOffline={!isServerOnline} />
      </div>

      {/* ── Bottom hint bar ───────────────────────────────────────────────── */}
      <div className="bg-gray-800 px-4 py-3 text-center">
        <p className="text-white/70 text-sm">
          {!effectiveSession
            ? t("scanner.select_above")
            : showUpcoming
              ? t("scanner.window_opening_soon")
              : showCancelled || showEnded
                ? t("scanner.session_closed_hint")
                : scanResult
                  ? t("scanner.scan_next")
                  : t("scanner.point_camera")}
        </p>
      </div>
    </div>
  );
}
