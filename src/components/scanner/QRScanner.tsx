"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, RefreshCw, ImageIcon } from "lucide-react";
import { useTranslation } from "@/providers/LanguageProvider";

type PermState =
  | "idle"         // no active session — renders nothing
  | "ready"        // session open, waiting for user tap
  | "requesting"   // camera stream starting
  | "active"       // camera running, scanning
  | "denied"       // NotAllowedError — need iOS Settings change
  | "in_use"       // NotReadableError — camera locked by another app
  | "unsupported"; // no camera hardware

interface QRScannerProps {
  onScan: (token: string) => void;
  active: boolean;
}

export function QRScanner({ onScan, active }: QRScannerProps) {
  const [permState, setPermState] = useState<PermState>("idle");
  const { t } = useTranslation();

  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const rafRef       = useRef<number>(0);
  const onScanRef    = useRef(onScan);
  const mountedRef   = useRef(true);

  // Keep callback fresh without restarting camera
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // Session open/close
  useEffect(() => {
    if (active) {
      setPermState((prev) => (prev === "idle" ? "ready" : prev));
    } else {
      stopCamera();
      setPermState("idle");
    }
  }, [active]);

  // Hard cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, []);

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // Scan loop — runs on every animation frame while camera is active
  const scanLoop = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(scanLoop); return; }

    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);

    // Lazy-import jsQR so it doesn't block initial render
    import("jsqr").then(({ default: jsQR }) => {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) {
        onScanRef.current(code.data.trim());
      }
    }).catch(() => {});

    if (mountedRef.current) {
      rafRef.current = requestAnimationFrame(scanLoop);
    }
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermState("unsupported");
      return;
    }

    setPermState("requesting");

    try {
      // Soft rear-camera preference — falls back to any camera on single-camera devices
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;

      // iOS Safari REQUIRES playsinline + muted + autoplay to render inline
      video.setAttribute("playsinline", "true");
      video.setAttribute("autoplay",    "true");
      video.muted = true;

      await video.play();

      if (!mountedRef.current) { stopCamera(); return; }

      setPermState("active");
      rafRef.current = requestAnimationFrame(scanLoop);

    } catch (err: any) {
      if (!mountedRef.current) return;
      stopCamera();

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
        // OverconstrainedError and anything else — show denied screen
        // (permission was technically granted, but instructing user to retry is correct)
        setPermState("denied");
      }
    }
  }

  // Fallback: file input → decode QR from photo (100% iOS coverage)
  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    const { default: jsQR } = await import("jsqr");
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code?.data) {
      onScanRef.current(code.data.trim());
    }
  }

  function retryCamera() {
    setPermState("ready");
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

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
        <p className="text-sm text-white/60">Another app is using the camera. Close it and try again.</p>
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

        {/* File capture fallback — works on 100% of iOS even when stream is blocked */}
        <div className="w-full border-t border-white/10 pt-4">
          <p className="text-xs text-white/40 mb-2">Or scan with your camera app:</p>
          <label className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors cursor-pointer">
            <ImageIcon size={14} />
            Take Photo of QR Code
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileInput}
            />
          </label>
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
      <div className="flex flex-col items-center justify-center h-full text-white text-center p-8 gap-6">
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

        {/* File capture as alternative — always available */}
        <div className="w-full max-w-xs border-t border-white/10 pt-4">
          <p className="text-xs text-white/40 mb-2">No camera? Use your camera app instead:</p>
          <label className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors cursor-pointer">
            <ImageIcon size={14} />
            Take Photo of QR Code
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileInput}
            />
          </label>
        </div>
      </div>
    );
  }

  // permState === "active" — native video stream running
  return (
    <div className="w-full h-full relative">
      {/* Hidden canvas for jsQR frame decoding */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Live video feed — playsinline and muted are critical for iOS Safari */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Aiming brackets */}
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
