"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResultOverlay } from "@/components/scanner/ScanResult";
import { OfflineBanner } from "@/components/scanner/OfflineBanner";
import { queueScan } from "@/lib/db/offline";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import type { ScanResult } from "@/types";

export default function ScannerPage() {
  const canScan = usePermission("scanner", "view");
  const { isOnline, refreshCount } = useOfflineSync();
  const { t } = useTranslation();
  const [trainings, setTrainings] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining] = useState("");
  const [selectedSession, setSelectedSession] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  // Derived — true only when the selected session is currently open
  const selectedSessionData = sessions.find((s) => s.id === selectedSession);
  const sessionIsOpen = selectedSessionData?.status === "open";

  useEffect(() => {
    loadTrainings();
  }, []);

  useEffect(() => {
    if (selectedTraining) loadSessions(selectedTraining);
  }, [selectedTraining]);

  async function loadTrainings() {
    const data = await fetch("/api/trainings").then((r) => r.json());
    const active = (Array.isArray(data) ? data : []).filter(
      (t: any) => t.status === "active" || t.status === "upcoming"
    );
    setTrainings(active);
    if (active.length === 1) setSelectedTraining(active[0].id);
  }

  async function loadSessions(trainingId: string) {
    const data = await fetch(
      `/api/sessions?training_id=${trainingId}&status=open,upcoming`
    ).then((r) => r.json());
    const list = Array.isArray(data) ? data : [];
    setSessions(list);
    const openSession = list.find((s: any) => s.status === "open");
    if (openSession) setSelectedSession(openSession.id);
    else if (list.length === 1) setSelectedSession(list[0].id);
  }

  const handleScan = useCallback(async (token: string) => {
    const now = Date.now();
    if (token === lastScannedRef.current && now - lastScannedTimeRef.current < 3000) return;
    lastScannedRef.current = token;
    lastScannedTimeRef.current = now;

    // Clear previous result immediately so the new one feels snappy
    setScanResult(null);

    if (!selectedSession) {
      const result: ScanResult = { type: "unknown", message: t("scanner.session_required") };
      setScanResult(result);
      navigator.vibrate?.([100, 50, 100]);
      return;
    }

    if (!sessionIsOpen) {
      const result: ScanResult = { type: "unknown", message: t("scanner.session_not_open") };
      setScanResult(result);
      navigator.vibrate?.([100, 50, 100]);
      return;
    }

    if (!isOnline) {
      await queueScan({ sessionId: selectedSession, qrToken: token, scannedAt: new Date().toISOString() });
      await refreshCount();
      const result: ScanResult = { type: "success" };
      setScanResult(result);
      navigator.vibrate?.(200);
      return;
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sessionId: selectedSession }),
      });
      const data = (await res.json()) as ScanResult;
      setScanResult(data);
      if (data.type === "success") {
        navigator.vibrate?.(200);
      } else {
        navigator.vibrate?.([100, 50, 100]);
      }
    } catch {
      if (!navigator.onLine) {
        await queueScan({ sessionId: selectedSession, qrToken: token, scannedAt: new Date().toISOString() });
        await refreshCount();
        const result: ScanResult = { type: "success" };
        setScanResult(result);
        navigator.vibrate?.(200);
      } else {
        const result: ScanResult = { type: "unknown", message: t("scanner.network_error") };
        setScanResult(result);
        navigator.vibrate?.([100, 50, 100]);
      }
    }
  }, [selectedSession, sessionIsOpen, isOnline, refreshCount]);

  if (!canScan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900">{t("scanner.access_denied_title")}</h2>
        <p className="text-gray-500 mt-2">{t("scanner.access_denied_hint")}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 lg:relative lg:z-auto lg:inset-auto flex flex-col bg-gray-900 lg:h-[calc(100vh-2rem)] lg:rounded-2xl overflow-hidden">
      <OfflineBanner />

      {/* Session selector */}
      <div className="bg-gray-800 px-4 py-3 flex gap-2 z-10">
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
          {trainings.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={selectedSession}
          onChange={(e) => {
            setSelectedSession(e.target.value);
            setScanResult(null);
          }}
          disabled={!selectedTraining}
          className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <option value="">{t("scanner.select_session")}</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {t("trainings.session_number", { n: s.session_number })} — {s.status === "open" ? `🟢 ${t("common.status.open")}` : `⏳ ${t("common.status.upcoming")}`}
            </option>
          ))}
        </select>
      </div>

      {/* Camera area */}
      <div className="flex-1 relative overflow-hidden">
        <QRScanner onScan={handleScan} active={sessionIsOpen && !!selectedSession} />

        {/* No session selected */}
        {!selectedSession && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center bg-gray-900/80">
            <div className="text-4xl mb-4">📱</div>
            <p className="text-lg font-medium">{t("scanner.select_to_scan")}</p>
            <p className="text-sm text-white/60 mt-1">{t("scanner.select_to_scan_sub")}</p>
          </div>
        )}

        {/* Session selected but not open */}
        {selectedSession && !sessionIsOpen && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center bg-gray-900/80">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-lg font-medium">{t("scanner.no_session_open")}</p>
            <p className="text-sm text-white/60 mt-1">{t("scanner.open_to_scan")}</p>
          </div>
        )}

        <ScanResultOverlay result={scanResult} isOffline={!isOnline} />
      </div>

      {/* Bottom hint bar */}
      <div className="bg-gray-800 px-4 py-3 text-center">
        <p className="text-white/70 text-sm">
          {!selectedSession
            ? t("scanner.select_above")
            : !sessionIsOpen
              ? t("scanner.open_to_enable")
              : scanResult
                ? t("scanner.scan_next")
                : t("scanner.point_camera")}
        </p>
      </div>
    </div>
  );
}
