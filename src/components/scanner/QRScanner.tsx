"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { useTranslation } from "@/providers/LanguageProvider";

type PermState =
  | "idle"        // no active session — parent overlays show through
  | "ready"       // session open, waiting for user tap
  | "requesting"  // camera starting
  | "active"      // camera running, scanning
  | "denied"      // NotAllowedError — need iOS settings change
  | "in_use"      // NotReadableError — camera locked by another app
  | "unsupported"; // no camera hardware

interface QRScannerProps {
  onScan: (token: string) => void;
  active: boolean;
}

export function QRScanner({ onScan, active }: QRScannerProps) {
  const scannerRef = useRef<any>(null);
  const [permState, setPermState] = useState<PermState>("idle");
  const { t } = useTranslation();

  // Keep onScan ref current so session changes don't require camera restart
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // Session open/close → transition states
  useEffect(() => {
    if (active) {
      setPermState((prev) => (prev === "idle" ? "ready" : prev));
    } else {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      setPermState("idle");
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    }
  }, [active]);

  // Hard cleanup on page navigation
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) scanner.stop().catch(() => {});
    };
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermState("unsupported");
      return;
    }

    setPermState("requesting");

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        // Soft preference — falls back to any camera if rear is unavailable/overconstrained
        { facingMode: { ideal: "environment" } },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          onScanRef.current(decodedText.trim());
        },
        undefined // suppress per-frame "QR not found" errors
      );

      setPermState("active");
    } catch (err: any) {
      console.error("Camera start failed:", err);
      if (scannerRef.current) {
        try { scannerRef.current.clear(); } catch {}
        scannerRef.current = null;
      }

      const name = (err?.name ?? "").toLowerCase();
      const msg  = (err?.message ?? "").toLowerCase();

      if (
        name.includes("notallowed") ||
        name.includes("permissiondenied") ||
        msg.includes("permission") ||
        msg.includes("denied")
      ) {
        setPermState("denied");
      } else if (
        name.includes("notfound") ||
        name.includes("devicesnotfound") ||
        msg.includes("no devices") ||
        msg.includes("no camera") ||
        msg.includes("could not find")
      ) {
        setPermState("unsupported");
      } else if (
        name.includes("notreadable") ||
        name.includes("abort") ||
        msg.includes("in use") ||
        msg.includes("busy")
      ) {
        setPermState("in_use");
      } else {
        // OverconstrainedError, unknown — retry without facingMode constraint
        setPermState("denied");
      }
    }
  }

  async function retryCamera() {
    // Reset to ready so user can tap again
    setPermState("ready");
  }

  // ── UI ──────────────────────────────────────────────────────────────────────

  if (permState === "idle") return null;

  if (permState === "unsupported") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-4">
        <CameraOff size={48} className="text-yellow-400" />
        <p className="text-lg font-medium">{t("scanner.camera_unsupported_title")}</p>
        <p className="text-sm text-white/60">{t("scanner.camera_unsupported_hint")}</p>
      </div>
    );
  }

  if (permState === "in_use") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-4">
        <CameraOff size={48} className="text-orange-400" />
        <p className="text-lg font-medium">Camera is in use</p>
        <p className="text-sm text-white/60">
          Another app is using the camera. Close it and try again.
        </p>
        <button
          onClick={retryCamera}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} /> Try Again
        </button>
      </div>
    );
  }

  if (permState === "denied") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-6 gap-4 max-w-sm mx-auto">
        <CameraOff size={48} className="text-red-400 shrink-0" />
        <div>
          <p className="text-lg font-semibold">Camera Access Blocked</p>
          <p className="text-sm text-white/60 mt-1">
            The browser has blocked camera access. Fix it in one of these ways:
          </p>
        </div>

        {/* iOS Safari instructions */}
        <div className="w-full bg-white/10 rounded-xl p-4 text-left text-sm space-y-1.5">
          <p className="font-semibold text-white/90 mb-2">iPhone / iPad:</p>
          <p className="text-white/70">1. Open <strong>Settings</strong></p>
          <p className="text-white/70">2. Scroll down → <strong>Safari</strong></p>
          <p className="text-white/70">3. Tap <strong>Camera</strong></p>
          <p className="text-white/70">4. Find this site → set to <strong>Allow</strong></p>
          <div className="border-t border-white/10 pt-2 mt-2">
            <p className="text-white/50 text-xs">
              Or tap <strong>AA</strong> in the address bar → Website Settings → Camera → Allow
            </p>
          </div>
        </div>

        <div className="flex gap-3 w-full">
          <button
            onClick={() => { window.location.href = "app-settings:"; }}
            className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
          >
            Open Settings
          </button>
          <button
            onClick={retryCamera}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      </div>
    );
  }

  if (permState === "requesting") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-4">
        <Camera size={48} className="text-white/60 animate-pulse" />
        <p className="text-lg font-medium">{t("scanner.requesting")}</p>
        <p className="text-sm text-white/60">{t("scanner.allow_camera")}</p>
      </div>
    );
  }

  if (permState === "ready") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8">
        <button
          onClick={startCamera}
          className="flex flex-col items-center gap-5 p-10 rounded-2xl border-2 border-dashed border-white/30 hover:border-blue-400 hover:bg-white/5 transition-all active:scale-95 cursor-pointer select-none"
        >
          <Camera size={64} className="text-blue-400" />
          <div>
            <p className="text-xl font-semibold">Tap to start camera</p>
            <p className="text-sm text-white/60 mt-1">
              Point at a participant&apos;s QR code
            </p>
          </div>
        </button>
      </div>
    );
  }

  // permState === "active" — Html5Qrcode injects <video> into #qr-reader
  return (
    <div className="w-full h-full relative">
      <div id="qr-reader" className="w-full h-full" />

      {/* Aiming brackets — only visible while camera is actually running */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative w-64 h-64">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
        </div>
      </div>
    </div>
  );
}
