"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { QRScanner } from "@/components/scanner/QRScanner";
import { ScanResultOverlay } from "@/components/scanner/ScanResult";
import { OfflineBanner } from "@/components/scanner/OfflineBanner";
import { Select } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { queueScan } from "@/lib/db/offline";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { usePermission } from "@/hooks/usePermission";
import type { ScanResult } from "@/types";

export default function ScannerPage() {
  const canScan = usePermission("scan_qr");
  const { isOnline, refreshCount } = useOfflineSync();
  const [trainings, setTrainings] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining] = useState("");
  const [selectedSession, setSelectedSession] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(true);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    loadTrainings();
  }, []);

  useEffect(() => {
    if (selectedTraining) loadSessions(selectedTraining);
  }, [selectedTraining]);

  async function loadTrainings() {
    const supabase = createClient();
    const { data } = await supabase
      .from("trainings")
      .select("id, name, color, status")
      .in("status", ["active", "upcoming"])
      .order("name");
    setTrainings(data || []);
    if (data?.length === 1) setSelectedTraining(data[0].id);
  }

  async function loadSessions(trainingId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("sessions")
      .select("id, session_number, session_date, status")
      .eq("training_id", trainingId)
      .in("status", ["open", "upcoming"])
      .order("session_number", { ascending: false });
    setSessions(data || []);
    // Auto-select open session if available
    const openSession = data?.find((s: any) => s.status === "open");
    if (openSession) setSelectedSession(openSession.id);
    else if (data?.length === 1) setSelectedSession(data[0].id);
  }

  const handleScan = useCallback(async (token: string) => {
    // Debounce: ignore if same token within 3 seconds
    const now = Date.now();
    if (token === lastScannedRef.current && now - lastScannedTimeRef.current < 3000) return;
    lastScannedRef.current = token;
    lastScannedTimeRef.current = now;

    if (!selectedSession) {
      setScanResult({ type: "unknown", message: "Please select a session first" });
      showResultAndReset();
      return;
    }

    if (!isOnline) {
      // Queue for offline
      await queueScan({ sessionId: selectedSession, qrToken: token, scannedAt: new Date().toISOString() });
      await refreshCount();
      setScanResult({ type: "success" });
      showResultAndReset();
      return;
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sessionId: selectedSession }),
      });
      const data = await res.json();
      setScanResult(data as ScanResult);
    } catch {
      // If request fails and offline, queue it
      if (!navigator.onLine) {
        await queueScan({ sessionId: selectedSession, qrToken: token, scannedAt: new Date().toISOString() });
        await refreshCount();
        setScanResult({ type: "success" });
      } else {
        setScanResult({ type: "unknown", message: "Network error" });
      }
    }

    showResultAndReset();
  }, [selectedSession, isOnline, refreshCount]);

  function showResultAndReset() {
    setScanning(false);
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => {
      setScanResult(null);
      setScanning(true);
      lastScannedRef.current = "";
    }, 2000);
  }

  if (!canScan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-2">You don&apos;t have permission to use the scanner.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 lg:relative lg:inset-auto flex flex-col bg-gray-900 lg:h-[calc(100vh-2rem)] lg:rounded-2xl overflow-hidden">
      {/* Offline banner */}
      <OfflineBanner />

      {/* Session selector */}
      <div className="bg-gray-800 px-4 py-3 flex gap-2 z-10">
        <select
          value={selectedTraining}
          onChange={(e) => { setSelectedTraining(e.target.value); setSelectedSession(""); }}
          className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Training...</option>
          {trainings.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={selectedSession}
          onChange={(e) => setSelectedSession(e.target.value)}
          disabled={!selectedTraining}
          className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <option value="">Select Session...</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              Session {s.session_number} — {s.status === "open" ? "🟢 Open" : "⏳ Upcoming"}
            </option>
          ))}
        </select>
      </div>

      {/* Camera area */}
      <div className="flex-1 relative overflow-hidden">
        <QRScanner onScan={handleScan} active={scanning && !!selectedSession} />

        {/* Targeting overlay */}
        {!scanResult && selectedSession && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-64 h-64">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
            </div>
          </div>
        )}

        {/* No session selected */}
        {!selectedSession && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center bg-gray-900/80">
            <div className="text-4xl mb-4">📱</div>
            <p className="text-lg font-medium">Select a training and session</p>
            <p className="text-sm text-white/60 mt-1">to start scanning</p>
          </div>
        )}

        {/* Scan result overlay */}
        <ScanResultOverlay result={scanResult} isOffline={!isOnline} />
      </div>

      {/* Status bar */}
      {selectedSession && !scanResult && (
        <div className="bg-gray-800 px-4 py-3 text-center">
          <p className="text-white/70 text-sm">
            {scanning ? "Point camera at participant QR code" : "Processing..."}
          </p>
        </div>
      )}
    </div>
  );
}
