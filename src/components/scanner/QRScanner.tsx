"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/providers/LanguageProvider";

type PermState =
  | "idle"         // no active session — renders nothing (video hidden)
  | "ready"        // session open, waiting for user tap
  | "requesting"   // getUserMedia in flight
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

  // CRITICAL: these refs must always be in the DOM.
  // videoRef.current must be non-null BEFORE getUserMedia resolves —
  // setting srcObject on a null ref is what was silently crashing into "denied".
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);
  const onScanRef  = useRef(onScan);
  const mountedRef = useRef(true);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (active) {
      setPermState((prev) => (prev === "idle" ? "ready" : prev));
    } else {
      stopCamera();
      setPermState("idle");
    }
  }, [active]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, []);

  // iOS kills the camera stream when the app goes to background (low battery,
  // switching apps, locking screen). Restart when the page becomes visible again.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && active && !streamRef.current) {
        startCamera();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

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

    try {
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);

      import("jsqr").then(({ default: jsQR }) => {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code?.data) onScanRef.current(code.data.trim());
      }).catch(() => {});
    } catch {
      // frame failed (low memory / video not ready on iOS) — skip silently
    }

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

      // Defensive null check — the <video> element is always in the DOM now,
      // but guard anyway so we never crash into a misclassified "denied" state.
      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setPermState("ready");
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;

      // iOS Safari: call load() after setting srcObject, before play()
      // Without this, play() can silently fail on iOS
      videoRef.current.load();
      await videoRef.current.play();

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
        setPermState("denied");
      }
    }
  }

  function retryCamera() {
    setPermState("ready");
  }

  // ── Single return — video is ALWAYS in the DOM ────────────────────────────
  // This is the fix: permState === "requesting" used to render a spinner with
  // NO <video> element, so videoRef.current was null when getUserMedia resolved.
  // Now we always render the <video> and use CSS visibility to hide it.

  return (
    <div className="w-full h-full relative bg-black">
      {/* Always-present elements — never conditionally unmounted */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <video
        ref={videoRef}
        className={cn(
          "w-full h-full object-cover",
          permState !== "active" && "invisible absolute inset-0 pointer-events-none"
        )}
        playsInline
        muted
        autoPlay
      />

      {/* Aiming brackets — only when active */}
      {permState === "active" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-64 h-64">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
          </div>
        </div>
      )}

      {/* Ready — tap to start */}
      {(permState === "idle" || permState === "ready") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-8 gap-6">
          <button
            onClick={startCamera}
            disabled={permState === "idle"}
            className="flex flex-col items-center gap-5 p-10 rounded-2xl border-2 border-dashed border-white/30 hover:border-blue-400 hover:bg-white/5 transition-all active:scale-95 cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Camera size={64} className="text-blue-400" />
            <div>
              <p className="text-xl font-semibold">{t("scanner.tap_to_start")}</p>
              <p className="text-sm text-white/60 mt-1">{t("scanner.point_camera")}</p>
            </div>
          </button>
        </div>
      )}

      {/* Requesting */}
      {permState === "requesting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-8 gap-4">
          <Camera size={48} className="text-white/60 animate-pulse" />
          <p className="text-lg font-medium">{t("scanner.requesting")}</p>
          <p className="text-sm text-white/60">{t("scanner.allow_camera")}</p>
        </div>
      )}

      {/* In use */}
      {permState === "in_use" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-8 gap-4">
          <CameraOff size={48} className="text-orange-400" />
          <p className="text-lg font-medium">{t("scanner.in_use_title")}</p>
          <p className="text-sm text-white/60">{t("scanner.in_use_hint")}</p>
          <button
            onClick={retryCamera}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} /> {t("scanner.try_again")}
          </button>
        </div>
      )}

      {/* Unsupported */}
      {permState === "unsupported" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-8 gap-4">
          <CameraOff size={48} className="text-yellow-400" />
          <p className="text-lg font-medium">{t("scanner.camera_unsupported_title")}</p>
          <p className="text-sm text-white/60">{t("scanner.camera_unsupported_hint")}</p>
        </div>
      )}

      {/* Denied — iOS instructions */}
      {permState === "denied" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-6 gap-4 overflow-y-auto">
          <CameraOff size={48} className="text-red-400 shrink-0" />
          <div>
            <p className="text-lg font-semibold">{t("scanner.camera_denied_title")}</p>
            <p className="text-sm text-white/60 mt-1">
              {t("scanner.denied_hint_short")}
            </p>
          </div>

          <div className="w-full max-w-sm bg-white/10 rounded-xl p-4 text-left text-sm space-y-1.5">
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

          <div className="flex gap-3 w-full max-w-sm">
            <button
              onClick={() => { window.location.href = "app-settings:"; }}
              className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
            >
              {t("scanner.open_settings")}
            </button>
            <button
              onClick={retryCamera}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={14} /> {t("scanner.try_again")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
