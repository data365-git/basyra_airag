"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Check, CheckCircle, XCircle, Loader2, ChevronDown } from "lucide-react";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResultOverlay } from "@/components/scanner/ScanResult";
import { ConfirmOverrideSheet } from "@/components/scanner/ConfirmOverrideSheet";
import { ScannerBottomSheet } from "@/components/scanner/ScannerBottomSheet";
import { OfflineBanner } from "@/components/scanner/OfflineBanner";
import { queueScan } from "@/lib/db/offline";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useServerStatus } from "@/hooks/useServerStatus";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import { formatTime, cn } from "@/lib/utils";
import { getSessionState, getTodayInTashkent } from "@/lib/sessionWindow";
import type { ScanResult, SessionState } from "@/types";

// ─── UI State machine ─────────────────────────────────────────────────────────
// Drives which overlays appear and whether the camera is active.
// Pill buttons are always rendered — state only affects their appearance.

type ScannerUIState =
  | "loading"            // fetching context on mount
  | "auto_ready"         // auto-selected training + session (zero interaction required)
  | "needs_training"     // multiple trainings, none selected yet
  | "needs_session"      // training chosen, no today session / none selected
  | "no_session_today"   // one training, nothing scheduled today
  | "no_active_training" // no active/upcoming training at all
  | "override";          // user manually changed training or session

// ─── Supporting types ─────────────────────────────────────────────────────────

interface ResolvedSession {
  id:             string;
  session_number: number;
  session_date:   string;
  session_time:   string;
  isCancelled?:   boolean;
  forceClosed?:   boolean;
}

interface ResolvedTraining {
  id:   string;
  name: string;
}

interface TrainingListItem {
  id: string;
  name: string;
  status?: "active" | "upcoming" | "completed";
  start_date?: string;
  end_date?: string;
}

interface SessionListItem {
  id: string;
  session_number: number;
  session_date: string;
  session_time: string;
  is_cancelled?: boolean;
  force_closed?: boolean;
}

// ─── Token extraction ─────────────────────────────────────────────────────────
// QR codes may contain a raw UUID, a full URL (?token=xxx or /scan/xxx), or JSON.
// This normalises any format down to the bare token string.

function extractToken(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();

  // URL: extract token from query param or last path segment
  if (trimmed.startsWith("http")) {
    try {
      const url = new URL(trimmed);
      const param = url.searchParams.get("token") || url.searchParams.get("qrToken");
      if (param) return param.trim();
      // Fall back to last non-empty path segment (e.g. /scan/UUID)
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && last.length > 10) return last.trim();
    } catch {
      // URL parsing failed — fall through to raw token
    }
  }

  // JSON: extract token/qrToken/id field
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return (parsed.token || parsed.qrToken || parsed.id || "").trim();
    } catch {
      // not valid JSON — fall through
    }
  }

  // Raw token (UUID or other string)
  return trimmed;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const canScan = usePermission("scanner", "view");
  const { pendingCount, refreshCount, syncPending } = useOfflineSync();
  const { isServerOnline, checkNow } = useServerStatus();
  const { t } = useTranslation();

  // ── Core state machine ────────────────────────────────────────────────────
  const [uiState, setUiState]         = useState<ScannerUIState>("loading");
  const [training, setTraining]       = useState<ResolvedTraining | null>(null);
  const [session,  setSession]        = useState<ResolvedSession  | null>(null);

  // Manual selections (used when user overrides auto-select)
  const [allTrainings,     setAllTrainings]     = useState<TrainingListItem[]>([]);
  const [allSessions,      setAllSessions]      = useState<SessionListItem[]>([]);
  const [selectedTraining, setSelectedTraining] = useState("");
  const [selectedSession,  setSelectedSession]  = useState("");

  // Bottom sheet open state
  const [trainingSheetOpen, setTrainingSheetOpen] = useState(false);
  const [sessionSheetOpen,  setSessionSheetOpen]  = useState(false);

  // Live session window state (ticker)
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [scanCount,    setScanCount]    = useState(0);
  const [scanResult,   setScanResult]   = useState<ScanResult | null>(null);

  // Pending override — when API returns needs_confirmation
  const [pendingOverride, setPendingOverride] = useState<{
    qrToken:           string;
    sessionId:         string;
    name:              string;
    existingStatus:    string;
    existingMethod:    string;
    existingScannedAt: string | null;
    newStatus:         string;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const lastScannedRef     = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const tickRef            = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Effective training / session ──────────────────────────────────────────
  // Manual choice (selectedTraining/Session) wins; auto-selected falls back.
  const effectiveTraining: ResolvedTraining | null = (() => {
    if (selectedTraining) {
      const found = allTrainings.find((tr) => tr.id === selectedTraining);
      if (found) return { id: found.id, name: found.name };
    }
    return training; // from context (auto_ready)
  })();

  const effectiveSession: ResolvedSession | null = (() => {
    if (selectedSession) {
      const found = allSessions.find((s) => s.id === selectedSession);
      if (found) return {
        id:             found.id,
        session_number: found.session_number,
        session_date:   found.session_date,
        session_time:   found.session_time,
        isCancelled:    found.is_cancelled,
        forceClosed:    found.force_closed,
      };
    }
    if (uiState === "auto_ready" && session) return session;
    return null;
  })();

  // ── Mount: load context + trainings in parallel ───────────────────────────
  useEffect(() => {
    syncPending();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Visibility: re-attempt sync when user returns to the tab/app ──────────
  // Covers the common case: scan → phone goes to sleep → user wakes phone →
  // app is visible again → pending queue should drain immediately.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && pendingCount > 0) {
        syncPending();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncPending, pendingCount]);

  async function loadAll() {
    setUiState("loading");

    const [contextRes, trainingsRes] = await Promise.allSettled([
      fetch("/api/scanner/context").then((r) => {
        if (r.status === 401) { window.location.replace("/login"); throw new Error("401"); }
        return r.json();
      }),
      fetch("/api/trainings").then((r) => {
        if (r.status === 401) { window.location.replace("/login"); throw new Error("401"); }
        return r.json();
      }),
    ]);

    const context   = contextRes.status   === "fulfilled" ? contextRes.value  : null;
    const trainings = trainingsRes.status === "fulfilled" ? trainingsRes.value : [];

    const activeTrainings = (Array.isArray(trainings) ? trainings : []).filter(
      (tr: TrainingListItem) => tr.status === "active" || tr.status === "upcoming"
    );
    setAllTrainings(activeTrainings);

    // ── State machine decision ─────────────────────────────────────────────
    if (context?.autoSelected) {
      // Perfect: one training, one session today — go straight to ready
      // Guard against malformed API response (missing training/session fields)
      if (!context.training || !context.session) {
        setUiState("no_active_training");
        return;
      }
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
      const tr = activeTrainings[0];
      setTraining({ id: tr.id, name: tr.name });
      setSelectedTraining(tr.id);
      setUiState("no_session_today");
      // Preload sessions for the session sheet
      loadSessionsForTraining(tr.id);
      return;
    }

    // Multiple active trainings — let admin pick
    setUiState("needs_training");
  }

  async function loadSessionsForTraining(trainingId: string) {
    try {
      const data = await fetch(`/api/sessions?training_id=${trainingId}`).then((r) => r.json());
      const list: SessionListItem[] = Array.isArray(data) ? data : [];
      setAllSessions(list);

      // Auto-select today's session if available
      const today = getTodayInTashkent();
      const todaySession = list.find((s) => s.session_date === today);
      if (todaySession) {
        setSelectedSession(todaySession.id);
      } else if (list.length === 1) {
        setSelectedSession(list[0].id);
      } else {
        setSelectedSession("");
      }
    } catch {}
  }

  // ── Session state ticker ──────────────────────────────────────────────────
  // State only changes at midnight (date flip) — check every 60 s is enough.
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!effectiveSession) { setSessionState(null); return; }

    const input = {
      sessionDate: effectiveSession.session_date,
      sessionTime: effectiveSession.session_time,
      isCancelled: effectiveSession.isCancelled ?? false,
      forceClosed: effectiveSession.forceClosed  ?? false,
    };

    const tick = () => setSessionState(getSessionState(input, undefined, new Date()));

    tick();
    tickRef.current = setInterval(tick, 60_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [effectiveSession]);

  useEffect(() => {
    if (sessionState === "active" && effectiveSession) {
      fetchScanCount(effectiveSession.id);
    }
  }, [sessionState, effectiveSession]);

  async function fetchScanCount(sessionId: string) {
    try {
      const res  = await fetch(`/api/sessions/${sessionId}/attendance`);
      if (res.ok) {
        const data = await res.json();
        setScanCount(Array.isArray(data) ? data.length : (data?.count ?? 0));
      }
    } catch {}
  }

  // ── Training sheet handlers ───────────────────────────────────────────────
  function handleSelectTraining(id: string) {
    setTrainingSheetOpen(false);
    setSelectedTraining(id);
    setSelectedSession("");
    setAllSessions([]);
    setScanResult(null);
    // Move out of auto_ready so effectiveSession uses selectedSession
    if (uiState === "auto_ready") setUiState("override");
    else if (uiState === "no_session_today") setUiState("override");
    else setUiState("override");
    loadSessionsForTraining(id);
  }

  // ── Session sheet handlers ────────────────────────────────────────────────
  async function openSessionSheet() {
    const tid = selectedTraining || training?.id;
    if (tid && allSessions.length === 0) {
      await loadSessionsForTraining(tid);
    }
    setSessionSheetOpen(true);
  }

  function handleSelectSession(id: string) {
    setSessionSheetOpen(false);
    setSelectedSession(id);
    setScanResult(null);
    // Move out of auto_ready so effectiveSession uses selectedSession
    if (uiState === "auto_ready" || uiState === "no_session_today") {
      setUiState("override");
    }
  }

  // ── Core API call for live scans ──────────────────────────────────────────
  const callScanAPI = useCallback(async (qrToken: string) => {
    if (!effectiveSession) return;
    if (!effectiveSession.id) {
      setScanResult({ type: "unknown", message: t("scanner.session_required") });
      navigator.vibrate?.([100, 50, 100]);
      return;
    }
    try {
      console.log(`📤 Scan sent: token=${qrToken.slice(0, 8)}… sessionId=${effectiveSession.id}`);
      const res  = await fetch("/api/scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: qrToken, sessionId: effectiveSession.id }),
      });
      const data = await res.json().catch(() => ({}));
      console.log(`📥 Scan response: status=${res.status}`, data);

      // Server error with no type field (auth, 500, etc.)
      if (!res.ok && !data.type) {
        setScanResult({ type: "unknown", message: data.message || data.error || t("scanner.network_error") });
        navigator.vibrate?.([100, 50, 100]);
        return;
      }

      // Confirmation needed — show sheet, do not show result overlay
      if (data.type === "needs_confirmation") {
        setPendingOverride({
          qrToken,
          sessionId:         effectiveSession.id,
          name:              data.participant?.full_name ?? "",
          existingStatus:    data.existingStatus   ?? "absent",
          existingMethod:    data.existingMethod   ?? "system",
          existingScannedAt: data.existingScannedAt ?? null,
          newStatus:         data.newStatus        ?? "present",
        });
        return;
      }

      const result = data as ScanResult;
      setScanResult(result);

      if (result.type === "success" || result.type === "late") {
        navigator.vibrate?.(200);
        setScanCount((c) => c + 1);
      } else {
        navigator.vibrate?.([100, 50, 100]);
      }
    } catch {
      await queueScan({ sessionId: effectiveSession.id, qrToken, scannedAt: new Date().toISOString() });
      await refreshCount();
      setScanResult({ type: "queued_offline" });
      navigator.vibrate?.([100, 50, 100]);
    }
  }, [effectiveSession, refreshCount, t]);

  // ── Override confirmation handlers ────────────────────────────────────────
  const handleConfirmOverride = useCallback(async () => {
    if (!pendingOverride || isConfirming) return;
    const { qrToken, sessionId } = pendingOverride;
    setPendingOverride(null);
    setIsConfirming(true);
    try {
      const res  = await fetch("/api/scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: qrToken, sessionId, forceOverride: true }),
      });
      const data = await res.json().catch(() => ({}));
      const result = data as ScanResult;
      setScanResult(result);
      if (result.type === "success" || result.type === "late") {
        navigator.vibrate?.(200);
        setScanCount((c) => c + 1);
      } else {
        navigator.vibrate?.([100, 50, 100]);
      }
    } catch {
      if (qrToken && sessionId) {
        await queueScan({ sessionId, qrToken, scannedAt: new Date().toISOString() });
        await refreshCount();
        setScanResult({ type: "queued_offline" });
      } else {
        setScanResult({ type: "unknown", message: t("scanner.network_error") });
      }
      navigator.vibrate?.([100, 50, 100]);
    } finally {
      setIsConfirming(false);
    }
  }, [pendingOverride, isConfirming, refreshCount, t]);

  const handleCancelOverride = useCallback(() => {
    if (isConfirming) return;
    setPendingOverride(null);
  }, [isConfirming]);

  // ── Scan handler ──────────────────────────────────────────────────────────
  const handleScan = useCallback(async (rawQrData: string) => {
    const qrToken = extractToken(rawQrData);
    if (!qrToken) {
      setScanResult({ type: "unknown", message: t("scanner.invalid_qr") });
      navigator.vibrate?.([100, 50, 100]);
      return;
    }

    const now = Date.now();
    if (qrToken === lastScannedRef.current && now - lastScannedTimeRef.current < 3000) return;
    lastScannedRef.current     = qrToken;
    lastScannedTimeRef.current = now;

    setScanResult(null);

    if (!effectiveSession) {
      setScanResult({ type: "unknown", message: t("scanner.session_required") });
      navigator.vibrate?.([100, 50, 100]);
      return;
    }

    const reachable = await checkNow();
    if (!reachable) {
      await queueScan({ sessionId: effectiveSession.id, qrToken, scannedAt: new Date().toISOString() });
      await refreshCount();
      setScanResult({ type: "queued_offline" });
      navigator.vibrate?.([100, 50, 100]);
      return;
    }

    await callScanAPI(qrToken);
  }, [effectiveSession, checkNow, refreshCount, callScanAPI, t]);

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

  // ── Pill button labels ────────────────────────────────────────────────────
  const trainingLabel = effectiveTraining?.name ?? t("scanner.select_training");
  const trainingSelected = !!effectiveTraining;

  const sessionLabel = effectiveSession
    ? `${t("trainings.session_number", { n: String(effectiveSession.session_number) })} · ${formatTime(effectiveSession.session_time)}`
    : uiState === "no_session_today"
    ? t("scanner.no_session_today")
    : t("scanner.select_session");
  const sessionSelected = !!effectiveSession;

  const noTrainingForSession = !effectiveTraining;

  const todayStr = getTodayInTashkent();

  // ── Hint bar text ─────────────────────────────────────────────────────────
  function hintText() {
    if (uiState === "loading" || uiState === "no_active_training") return "";
    if (!effectiveSession)          return t("scanner.select_session");
    if (showUpcoming)               return t("scanner.session_future");
    if (showCancelled || showEnded) return t("scanner.session_closed_hint");
    if (scanResult)                 return t("scanner.scan_next");
    return t("scanner.point_camera");
  }

  return (
    <div className="fixed inset-0 z-40 lg:relative lg:z-auto lg:inset-auto flex flex-col bg-gray-900 lg:h-[calc(100vh-2rem)] lg:rounded-2xl overflow-hidden">
      <OfflineBanner />

      {/* ── Selector bar — always two pill buttons ───────────────────────── */}
      <div className="bg-gray-800 px-4 py-3 flex gap-2 z-10">
        {uiState === "loading" ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-white/50 text-sm py-1">
            <Loader2 size={14} className="animate-spin" />
            {t("common.loading")}
          </div>
        ) : uiState === "no_active_training" ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-1">
            {t("scanner.no_active_training")}
          </div>
        ) : (
          <>
            {/* Training pill */}
            <button
              onClick={() => setTrainingSheetOpen(true)}
              className={cn(
                "flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-colors min-w-0",
                trainingSelected
                  ? "bg-blue-600/30 border-blue-500/50 text-white"
                  : "bg-gray-700/60 border-gray-600 text-white/60"
              )}
            >
              <span className="truncate min-w-0">{trainingLabel}</span>
              <ChevronDown size={14} className="shrink-0 text-white/50" />
            </button>

            {/* Session pill */}
            <button
              onClick={openSessionSheet}
              disabled={noTrainingForSession}
              className={cn(
                "flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-colors min-w-0",
                sessionSelected
                  ? "bg-blue-600/30 border-blue-500/50 text-white"
                  : "bg-gray-700/60 border-gray-600 text-white/60",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              <span className="truncate min-w-0">{sessionLabel}</span>
              <ChevronDown size={14} className="shrink-0 text-white/50" />
            </button>
          </>
        )}
      </div>

      {/* ── Camera area ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <QRScanner onScan={handleScan} active={cameraActive} />

        {/* Idle: no effective session */}
        {!effectiveSession && uiState !== "loading" && uiState !== "no_active_training" && (
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

        {/* No active training */}
        {uiState === "no_active_training" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center bg-gray-900/80 px-6">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-lg font-medium">{t("scanner.no_active_training")}</p>
          </div>
        )}

        {/* Upcoming: future date */}
        {showUpcoming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 px-6 text-center">
            <div className="text-4xl mb-4">📅</div>
            <p className="text-white text-lg font-medium">{t("scanner.session_future")}</p>
            {effectiveSession && (
              <p className="text-white/50 text-sm mt-2">{effectiveSession.session_date}</p>
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

        {/* ── Override confirmation sheet ───────────────────────────────── */}
        {(pendingOverride || isConfirming) && (
          <ConfirmOverrideSheet
            name={pendingOverride?.name ?? ""}
            existingStatus={pendingOverride?.existingStatus ?? "absent"}
            existingMethod={pendingOverride?.existingMethod ?? "system"}
            existingScannedAt={pendingOverride?.existingScannedAt ?? null}
            newStatus={pendingOverride?.newStatus ?? "present"}
            isLoading={isConfirming}
            onConfirm={handleConfirmOverride}
            onCancel={handleCancelOverride}
          />
        )}

        {/* ── Training bottom sheet ─────────────────────────────────────── */}
        <ScannerBottomSheet
          open={trainingSheetOpen}
          onClose={() => setTrainingSheetOpen(false)}
          title={t("scanner.select_training")}
        >
          {allTrainings.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-8">{t("scanner.no_active_training")}</p>
          ) : (
            allTrainings.map((tr) => {
              const isSelected = effectiveTraining?.id === tr.id;
              return (
                <button
                  key={tr.id}
                  onClick={() => handleSelectTraining(tr.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex items-start justify-between gap-3 transition-colors",
                    isSelected ? "bg-blue-900/30" : "hover:bg-white/5 active:bg-white/10"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm leading-snug truncate">{tr.name}</p>
                    {(tr.start_date || tr.end_date) && (
                      <p className="text-white/40 text-xs mt-0.5">
                        {tr.start_date} — {tr.end_date}
                      </p>
                    )}
                    {tr.status && (
                      <span className={cn(
                        "inline-block text-xs mt-1 px-2 py-0.5 rounded-full",
                        tr.status === "active" ? "bg-green-600/30 text-green-300" : "bg-gray-600/40 text-gray-400"
                      )}>
                        {tr.status}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={16} className="text-blue-400 shrink-0 mt-0.5" />}
                </button>
              );
            })
          )}
        </ScannerBottomSheet>

        {/* ── Session bottom sheet ──────────────────────────────────────── */}
        <ScannerBottomSheet
          open={sessionSheetOpen}
          onClose={() => setSessionSheetOpen(false)}
          title={t("scanner.select_session")}
        >
          {allSessions.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-8">{t("scanner.no_session_today")}</p>
          ) : (
            allSessions.map((s) => {
              const isSelected = effectiveSession?.id === s.id;
              const isToday    = s.session_date === todayStr;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelectSession(s.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex items-start justify-between gap-3 transition-colors",
                    isSelected ? "bg-blue-900/30" : isToday ? "bg-blue-950/30 hover:bg-blue-900/20" : "hover:bg-white/5 active:bg-white/10"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm leading-snug">
                      {t("trainings.session_number", { n: String(s.session_number) })} · {s.session_date}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-white/50 text-xs">{formatTime(s.session_time)}</span>
                      {isToday && (
                        <span className="text-xs bg-green-600/40 text-green-300 px-1.5 py-0.5 rounded-full">
                          {t("scanner.today")}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check size={16} className="text-blue-400 shrink-0 mt-0.5" />}
                </button>
              );
            })
          )}
        </ScannerBottomSheet>
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
