"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { useTranslation } from "@/providers/LanguageProvider";

type PermState = "idle" | "ready" | "requesting" | "active" | "denied" | "unsupported";

interface QRScannerProps {
  onScan: (token: string) => void;
  active: boolean; // true when a session is selected AND open
}

export function QRScanner({ onScan, active }: QRScannerProps) {
  const scannerRef = useRef<any>(null);
  const [permState, setPermState] = useState<PermState>("idle");
  const { t } = useTranslation();

  // Always call the latest version of onScan without restarting the scanner
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // React to session open/close changes
  useEffect(() => {
    if (active) {
      // Session became available → show tap-to-start if we're idle
      setPermState((prev) => (prev === "idle" ? "ready" : prev));
    } else {
      // Session closed / deselected → immediately hide UI, then stop camera
      const scanner = scannerRef.current;
      scannerRef.current = null;
      setPermState("idle");
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    }
  }, [active]);

  // Hard cleanup on unmount (e.g. navigating away)
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner.stop().catch(() => {});
      }
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
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          // Always delegate to the latest onScan via ref
          onScanRef.current(decodedText.trim());
        },
        undefined // suppress per-frame "not found" errors
      );

      setPermState("active");
    } catch (err: any) {
      console.error("Camera start failed:", err);
      // Clean up partially-initialised scanner
      if (scannerRef.current) {
        try { scannerRef.current.clear(); } catch {}
        scannerRef.current = null;
      }
      const msg = (err?.message ?? "").toLowerCase();
      if (
        msg.includes("notfound") ||
        msg.includes("no devices") ||
        msg.includes("no camera") ||
        msg.includes("could not find")
      ) {
        setPermState("unsupported");
      } else {
        // NotAllowedError, OverconstrainedError, generic errors → treat as denied
        setPermState("denied");
      }
    }
  }

  // ── UI states ────────────────────────────────────────────────────────────────

  // idle → null lets the parent overlays ("select a session", etc.) show through
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

  if (permState === "denied") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-4">
        <CameraOff size={48} className="text-red-400" />
        <p className="text-lg font-medium">{t("scanner.camera_denied_title")}</p>
        <p className="text-sm text-white/60">{t("scanner.camera_denied_hint")}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          {t("scanner.reload_page")}
        </button>
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
            <p className="text-sm text-white/60 mt-1">Point at a participant&apos;s QR code</p>
          </div>
        </button>
      </div>
    );
  }

  // permState === "active" — Html5Qrcode injects <video> into #qr-reader
  return (
    <div className="w-full h-full relative">
      <div id="qr-reader" className="w-full h-full" />

      {/* Aiming brackets — live here so they only show when camera is actually running */}
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
