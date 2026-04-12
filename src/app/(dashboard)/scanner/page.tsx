"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Edit2, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
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
  secondsUntilOpen,
  formatCountdown,
  DEFAULT_WINDOW_BEFORE,
  DEFAULT_WINDOW_AFTER,
} from "@/lib/sessionWindow";
import type { ScanResult, SessionState } from "@/types";

// ─── UI State machine ─────────────────────────────────────────────────────────
// Every render path is driven by one of these states.
// Dropdowns only appear in: needs_training, needs_session, override.
// Everything else renders exactly one piece of UI — no conditionals stacking.

type ScannerUIState =
  | "loading"            // fetching context on mount
  | "auto_ready"         // chip + camera (zero interaction required)
  | "needs_training"     // multiple trainings → show training dropdown
  | "needs_session"      // training chosen, no today session → show session dropdown
  | "no_session_today"   // one training, nothing scheduled today
  | "no_active_training" // no active/upcoming training at all
  | "override";          // user tapped the pencil icon → full manual dropdowns

// ─── Supporting types ─────────────────────────────────────────────────────────

interface ResolvedSession {
  id:                 string;
  session_number:     number;
  session_date:       string;
  session_time:       string;
  scan_window_before: number;
  scan_window_after:  number;
  isCancelled?:       boolean;
  forceClosed?:       boolean;
}

interface ResolvedTraining {
  id:   string;
  name: string;
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function CountdownBlock({ secondsLeft, label }: { secondsLeft: number; label: string }) {
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
  const { refreshCount, syncPending } = useOfflineSync();
  const { isServerOnline, checkNow } = useServerStatus();
  const { t } = useTranslation();

  // ── Core state machine ────────────────────────────────────────────────────
  const [uiState, setUiState]         = useState<ScannerUIState>("loading");
  const [training, setTraining]       = useState<ResolvedTraining | null>(null);
  const [session,  setSession]        = useState<ResolvedSession  | null>(null);

  // For needs_training / override: all available trainings + their sessions
  const [allTrainings,     setAllTrainings]     = useState<any[]>([]);
  const [allSessions,      setAllSessions]      = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining] = useState("");
  const [selectedSession,  setSelectedSession]  = useState("");

  // Live session window state (ticker)
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [countdown,    setCountdown]    = useState(0);
  const [scanCount,    setScanCount]    = useState(0);
  const [scanResult,   setScanResult]   = useState<ScanResult | null>(null);

  const lastScannedRef     = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const tickRef            = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Effective session (what the camera scans for) ─────────────────────────
  // In auto_ready: the resolved session
  // In override / needs_session: the manually chosen session
  const effectiveSession: ResolvedSession | null = (() => {
    if (uiState === "auto_ready" && session) return session;
    if ((uiState === "override" || uiState === "needs_session") && selectedSession) {
      const found = allSessions.find((s: any) => s.id === selectedSession);
      if (found) return {
        id:                 found.id,
        session_number:     found.session_number,
        session_date:       found.session_date,
        session_time:       found.session_time,
        scan_window_before: DEFAULT_WINDOW_BEFORE,
        scan_window_after:  DEFAULT_WINDOW_AFTER,
      };
    }
    return null;
  })();

  // ── Mount: load context + trainings in parallel ───────────────────────────
  useEffect(() => {
    syncPending();
    loadAll();
  }, []);

  async function loadAll() {
    setUiState("loading");

    const [contextRes, trainingsRes] = await Promise.allSettled([
      fetch("/api/scanner/context").then((r) => r.json()),
      fetch("/api/trainings").then((r) => r.json()),
    ]);

    const context   = contextRes.status   === "fulfilled" ? contextRes.value   : null;
    const trainings = trainingsRes.status === "fulfilled" ? trainingsRes.value  : [];

    const activeTrainings = (Array.isArray(trainings) ? trainings : []).filter(
      (tr: any) => tr.status === "active" || tr.status === "upcoming"
    );
    setAllTrainings(activeTrainings);

    // ── State machine decision ─────────────────────────────────────────────
    if (context?.autoSelected) {
      // Perfect: one training, one session today — go straight to ready
      setTraining(context.training);
      setSession(context.session);
      setUiState("auto_ready");
      fetchScanCount(context.session.id);
      return;
    }

    if (activeTrainings.length === 0) {
      setUiState("no_active_training");
      return;
    }

    if (activeTrainings.length === 1) {
      // One training but context API didn't find today's session
      setTraining({ id: activeTrainings[0].id, name: activeTrainings[0].name });
      setSelectedTraining(activeTrainings[0].id);
      setUiState("no_session_today");
      // Preload sessions for the override dropdown
      loadSessionsForTraining(activeTrainings[0].id);
      return;
    }

    // Multiple active trainings — let admin pick
    setUiState("needs_training");
  }

  // ── When training is chosen in needs_training / override ─────────────────
  useEffect(() => {
    if (selectedTraining && (uiState === "needs_training" || uiState === "override")) {
      loadSessionsForTraining(selectedTraining);
    }
  }, [selectedTraining]);

  async function loadSessionsForTraining(trainingId: string) {
    try {
      const data = await fetch(`/api/sessions?training_id=${trainingId}`).then((r) => r.json());
      const list = Array.isArray(data) ? data : [];
      setAllSessions(list);

      // Auto-select today's session if available
      const today = new Date().toISOString().slice(0, 10);
      const todaySession = list.find((s: any) => s.session_date === today);
      if (todaySession) {
        setSelectedSession(todaySession.id);
      } else if (list.length === 1) {
        setSelectedSession(list[0].id);
      } else {
        setSelectedSession("");
      }
    } catch {}
  }

  // ── Session window ticker ─────────────────────────────────────────────────
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!effectiveSession) { setSessionState(null); return; }

    const windowInput = {
      sessionDate:      effectiveSession.session_date,
      sessionTime:      effectiveSession.session_time,
      isCancelled:      effectiveSession.isCancelled ?? false,
      forceClosed:      effectiveSession.forceClosed  ?? false,
      scanWindowBefore: effectiveSession.scan_window_before,
      scanWindowAfter:  effectiveSession.scan_window_after,
    };

    const tick = () => {
      const now   = new Date();
      const state = getSessionState(windowInput, undefined, now);
      setSessionState(state);
      setCountdown(state === "upcoming" ? secondsUntilOpen(windowInput, undefined, now) : 0);
    };

    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [effectiveSession?.id]);

  useEffect(() => {
    if (sessionState === "active" && effectiveSession) {
      fetchScanCount(effectiveSession.id);
    }
  }, [sessionState, effectiveSession?.id]);

  async function fetchScanCount(sessionId: string) {
    try {
      const res  = await fetch(`/api/sessions/${sessionId}/attendance`);
      if (res.ok) {
        const data = await res.json();
        setScanCount(Array.isArray(data) ? data.length : (data?.count ?? 0));
      }
    } catch {}
  }

  // ── Enter override mode (pencil icon) ─────────────────────────────────────
  function enterOverride() {
    if (training) setSelectedTraining(training.id);
    if (session)  setSelectedSession(session.id);
    if (training) loadSessionsForTraining(training.id);
    setUiState("override");
    setScanResult(null);
  }

  // ── Scan handler ──────────────────────────────────────────────────────────
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

    const reachable = await checkNow();

    if (!reachable) {
      await queueScan({ sessionId: effectiveSession.id, qrToken: token, scannedAt: new Date().toISOString() });
      await refreshCount();
      setScanResult({ type: "queued_offline" });
      navigator.vibrate?.([100, 50, 100]);
      return;
    }

    try {
      const res  = await fetch("/api/scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, sessionId: effectiveSession.id }),
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
      await queueScan({ sessionId: effectiveSession.id, qrToken: token, scannedAt: new Date().toISOString() });
      await refreshCount();
      setScanResult({ type: "queued_offline" });
      navigator.vibrate?.([100, 50, 100]);
    }
  }, [effectiveSession, checkNow, refreshCount, t]);

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!canScan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900">{t("scanner.access_denied_title")}</h2>
        <p className="text-gray-500 mt-2">{t("scanner.access_denied_hint")}</p>
      </div>
    );
  }

  // ── Camera overlay state ──────────────────────────────────────────────────
  const cameraActive  = !!effectiveSession && sessionState === "active";
  const showUpcoming  = !!effectiveSession && sessionState === "upcoming";
  const showCancelled = !!effectiveSession && (sessionState === "cancelled" || sessionState === "force_closed");
  const showEnded     = !!effectiveSession && sessionState === "ended";

  // ── Selector bar: ONE exclusive render path per uiState ──────────────────
  function renderSelectorBar() {
    switch (uiState) {
      case "loading":
        return (
          <div className="flex-1 flex items-center justify-center gap-2 text-white/50 text-sm py-1">
            <Loader2 size={14} className="animate-spin" />
            {t("common.loading")}
          </div>
        );

      case "auto_ready":
        return (
          <div className="flex-1 flex items-center justify-between bg-blue-600/30 border border-blue-500/50 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{training?.name}</p>
              <p className="text-blue-300 text-xs">
                {t("scanner.today")} · {formatTime(session?.session_time ?? "")}
              </p>
            </div>
            <button
              onClick={enterOverride}
              className="ml-2 p-1.5 rounded-md hover:bg-white/10 text-blue-300 hover:text-white transition-colors shrink-0"
              aria-label="Override selection"
            >
              <Edit2 size={14} />
            </button>
          </div>
        );

      case "no_session_today":
        return (
          <div className="flex-1 flex items-center justify-between bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{training?.name}</p>
              <p className="text-gray-400 text-xs">{t("scanner.no_session_today")}</p>
            </div>
            <button
              onClick={enterOverride}
              className="ml-2 p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
              aria-label="Pick session manually"
            >
              <Edit2 size={14} />
            </button>
          </div>
        );

      case "no_active_training":
        return (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-1">
            {t("scanner.no_active_training")}
          </div>
        );

      case "needs_training":
      case "needs_session":
      case "override":
        return (
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
              {allTrainings.map((tr: any) => (
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
              {allSessions.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {t("trainings.session_number", { n: s.session_number })} — {s.session_date}
                </option>
              ))}
            </select>
          </>
        );
    }
  }

  // ── Hint bar text ─────────────────────────────────────────────────────────
  function hintText() {
    if (uiState === "loading")             return "";
    if (uiState === "no_active_training")  return "";
    if (uiState === "no_session_today")    return t("scanner.select_above");
    if (!effectiveSession)                 return t("scanner.select_above");
    if (showUpcoming)                      return t("scanner.window_opening_soon");
    if (showCancelled || showEnded)        return t("scanner.session_closed_hint");
    if (scanResult)                        return t("scanner.scan_next");
    return t("scanner.point_camera");
  }

  return (
    <div className="fixed inset-0 z-40 lg:relative lg:z-auto lg:inset-auto flex flex-col bg-gray-900 lg:h-[calc(100vh-2rem)] lg:rounded-2xl overflow-hidden">
      <OfflineBanner />

      {/* ── Selector bar — exactly ONE path renders ─────────────────────── */}
      <div className="bg-gray-800 px-4 py-3 flex gap-2 z-10">
        {renderSelectorBar()}
      </div>

      {/* ── Camera area ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <QRScanner onScan={handleScan} active={cameraActive} />

        {/* Idle: no effective session */}
        {!effectiveSession && uiState !== "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center bg-gray-900/80 px-6">
            <div className="text-4xl mb-4">📱</div>
            <p className="text-lg font-medium">{t("scanner.select_to_scan")}</p>
            <p className="text-sm text-white/60 mt-1">{t("scanner.select_to_scan_sub")}</p>
          </div>
        )}

        {/* Loading */}
        {uiState === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
            <Loader2 size={32} className="animate-spin text-white/40" />
          </div>
        )}

        {/* Upcoming: countdown */}
        {showUpcoming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 px-6">
            <CountdownBlock secondsLeft={countdown} label={t("scanner.opens_in")} />
            {training && session && (
              <p className="text-white/50 text-xs mt-6">
                {training.name} · {t("scanner.session_short")} {session.session_number}
              </p>
            )}
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

        {/* Ended */}
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

      {/* ── Hint bar ─────────────────────────────────────────────────────── */}
      {hintText() && (
        <div className="bg-gray-800 px-4 py-3 text-center">
          <p className="text-white/70 text-sm">{hintText()}</p>
        </div>
      )}
    </div>
  );
}
