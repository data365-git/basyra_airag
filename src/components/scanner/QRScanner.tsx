"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

type PermState = "idle" | "requesting" | "denied" | "unsupported" | "active";

interface QRScannerProps {
  onScan: (token: string) => void;
  active: boolean;
}

export function QRScanner({ onScan, active }: QRScannerProps) {
  const scannerRef = useRef<any>(null);
  const [permState, setPermState] = useState<PermState>("idle");
  const [scannerRunning, setScannerRunning] = useState(false);

  // Pre-flight camera permission request
  async function requestPermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermState("unsupported");
      return;
    }
    setPermState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      // Release the stream immediately — html5-qrcode will re-acquire it
      stream.getTracks().forEach((t) => t.stop());
      setPermState("active");
    } catch {
      setPermState("denied");
    }
  }

  // Auto-request permission the first time the scanner becomes active
  useEffect(() => {
    if (active && permState === "idle") {
      requestPermission();
    }
  }, [active, permState]);

  // Start / stop the html5-qrcode scanner
  useEffect(() => {
    if (!active || permState !== "active") {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
        setScannerRunning(false);
      }
      return;
    }

    let cancelled = false;

    async function startScanner() {
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      if (cancelled) return;

      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          showZoomSliderIfSupported: false,
          defaultZoomValueIfSupported: 2,
        },
        false
      );

      scanner.render(
        (decodedText: string) => {
          onScan(decodedText.trim());
        },
        (err: string) => {
          if (!err.includes("NotFoundException")) {
            console.debug("QR scan error:", err);
          }
        }
      );

      if (!cancelled) {
        scannerRef.current = scanner;
        setScannerRunning(true);
      } else {
        scanner.clear().catch(() => {});
      }
    }

    startScanner().catch((e) => {
      console.error("Scanner start failed:", e);
      if (!cancelled) setPermState("denied");
    });

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
        setScannerRunning(false);
      }
    };
  }, [active, permState, onScan]);

  // ── UI states ──────────────────────────────────────────────────────────────

  if (permState === "unsupported") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-4">
        <CameraOff size={48} className="text-yellow-400" />
        <p className="text-lg font-medium">Camera not supported</p>
        <p className="text-sm text-white/60">
          Your browser or device doesn&apos;t support camera access. Try opening this page in Safari or Chrome.
        </p>
      </div>
    );
  }

  if (permState === "denied") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-4">
        <CameraOff size={48} className="text-red-400" />
        <p className="text-lg font-medium">Camera access denied</p>
        <p className="text-sm text-white/60">
          Allow camera access in your browser settings, then reload the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          Reload Page
        </button>
      </div>
    );
  }

  if (permState === "requesting") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-4">
        <Camera size={48} className="text-white/60 animate-pulse" />
        <p className="text-lg font-medium">Requesting camera access…</p>
        <p className="text-sm text-white/60">
          Please allow camera permission when your browser asks.
        </p>
      </div>
    );
  }

  if (permState === "idle") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-4">
        <Camera size={48} className="text-white/40" />
        <p className="text-sm text-white/50">Select an open session to activate the camera</p>
      </div>
    );
  }

  // permState === "active" — render the html5-qrcode container
  return (
    <div className="w-full h-full relative">
      <div id="qr-reader" className="w-full h-full" />
    </div>
  );
}
