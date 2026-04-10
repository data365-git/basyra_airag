"use client";

import { useEffect, useRef, useState } from "react";

interface QRScannerProps {
  onScan: (token: string) => void;
  active: boolean;
}

export function QRScanner({ onScan, active }: QRScannerProps) {
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!active) {
      if (scannerRef.current && started) {
        scannerRef.current.stop().catch(() => {});
        setStarted(false);
      }
      return;
    }

    let scanner: any;

    async function startScanner() {
      const { Html5QrcodeScanner } = await import("html5-qrcode");

      if (!containerRef.current) return;

      scanner = new Html5QrcodeScanner(
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

      scannerRef.current = scanner;

      scanner.render(
        (decodedText: string) => {
          onScan(decodedText.trim());
        },
        (error: string) => {
          // Ignore "NotFoundException" which fires constantly while scanning
          if (!error.includes("NotFoundException")) {
            console.debug("QR scan error:", error);
          }
        }
      );

      setStarted(true);
      setError("");
    }

    startScanner().catch((e) => {
      setError("Camera access denied. Please allow camera permission.");
      console.error(e);
    });

    return () => {
      if (scanner) {
        scanner.clear().catch(() => {});
      }
    };
  }, [active, onScan]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8">
        <div className="text-4xl mb-4">📷</div>
        <p className="text-lg font-medium">{error}</p>
        <p className="text-sm text-white/70 mt-2">Check browser settings and reload</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <div id="qr-reader" className="w-full h-full" />
    </div>
  );
}
