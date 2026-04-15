"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QrCode, Loader2 } from "lucide-react";

declare global {
  interface Window {
    onTelegramAuth: (user: TelegramUser) => void;
    Telegram?: {
      WebApp?: {
        initData:   string;
        ready:      () => void;
        expand:     () => void;
        close:      () => void;
      };
    };
  }
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// ─── Synchronous Telegram Mini App detection ──────────────────────────────────
// Called inside useState() initializer so it runs before the first render,
// preventing the Login Widget from ever appearing inside a Mini App.
//
// Two detection paths:
//  1. window.Telegram.WebApp   — native Telegram clients (always synchronous)
//  2. URL hash #tgWebAppData=… — Telegram Web / some fallback clients
interface TgCtx { isInTg: boolean; initData: string }

function detectTelegramContext(): TgCtx {
  if (typeof window === "undefined") return { isInTg: false, initData: "" };

  // Path 1 — native WebApp object
  const twa = window.Telegram?.WebApp;
  if (twa) {
    twa.ready?.();
    twa.expand?.();
    return { isInTg: true, initData: twa.initData ?? "" };
  }

  // Path 2 — URL hash injected by Telegram before page JS runs
  if (window.location.hash.includes("tgWebApp")) {
    const hp  = new URLSearchParams(window.location.hash.slice(1));
    const raw = hp.get("tgWebAppData") ?? "";
    return { isInTg: true, initData: decodeURIComponent(raw) };
  }

  return { isInTg: false, initData: "" };
}

// ─── Inner component (needs useSearchParams → must be in Suspense) ────────────
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const widgetRef    = useRef<HTMLDivElement>(null);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [hint,    setHint]    = useState("");

  // Runs synchronously before the first render — isInTg is correct from frame 0
  const [tgCtx] = useState<TgCtx>(detectTelegramContext);

  const redirect = searchParams.get("redirect") ?? "/portal/me";

  // ── Effect: Mini App auth OR Login Widget injection ──────────────────────
  useEffect(() => {
    if (tgCtx.isInTg) {
      // ── Inside Telegram — NEVER inject Login Widget ──────────────────────
      if (!tgCtx.initData) {
        // Mini App opened without initData (some open paths) — show error
        setError("not_linked");
        return;
      }

      setLoading(true);
      setHint("Telegram orqali kirilmoqda...");

      fetch("/api/portal/telegram-miniapp-login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ initData: tgCtx.initData }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            router.replace(redirect);
          } else {
            setLoading(false);
            setHint("");
            setError(data.error === "not_linked" ? "not_linked" : (data.error ?? "Kirish amalga oshmadi"));
          }
        })
        .catch(() => {
          setLoading(false);
          setHint("");
          setError("Tarmoq xatosi. Qayta urinib ko'ring.");
        });

      return;
    }

    // ── Normal browser — inject Telegram Login Widget ────────────────────
    window.onTelegramAuth = async (user: TelegramUser) => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch("/api/portal/telegram-login", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(user),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Kirish amalga oshmadi");
          setLoading(false);
          return;
        }
        router.push(redirect);
      } catch {
        setError("Tarmoq xatosi. Qayta urinib ko'ring.");
        setLoading(false);
      }
    };

    if (!widgetRef.current) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", "basyra_yordamchi_bot");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-radius", "12");
    script.async = true;
    widgetRef.current.appendChild(script);

    return () => { window.onTelegramAuth = undefined as any; };
  }, [tgCtx, redirect, router]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6 text-center">
      {loading ? (
        /* Spinner (shown during any auth attempt) */
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">{hint || "Kirilmoqda..."}</p>
        </div>

      ) : tgCtx.isInTg ? (
        /* Inside Telegram — never show the Login Widget, only status */
        <div className="flex flex-col items-center gap-4 py-4">
          {error === "not_linked" ? (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 text-left w-full">
              <p className="font-semibold">Hisob ulanmagan</p>
              <p className="mt-1 text-red-500">
                Telegram hisobingiz tizimga ulanmagan. Botda <b>/login</b> buyrug'ini yuboring.
              </p>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 text-left w-full">
              {error}
            </div>
          ) : (
            <>
              <Loader2 size={28} className="animate-spin text-blue-400" />
              <p className="text-sm text-gray-500">Ulanilmoqda...</p>
            </>
          )}
        </div>

      ) : (
        /* Normal browser — show Login Widget */
        <>
          <div className="space-y-2">
            <p className="text-base font-semibold text-gray-800">Telegram orqali kiring</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              Telegram hisobingiz administrator tomonidan tizimga ulangan bo&apos;lishi kerak
            </p>
          </div>

          {/* Login Widget injects here */}
          <div ref={widgetRef} className="flex justify-center min-h-[48px]" />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 text-left">
              {error === "not_linked" ? (
                <>
                  <p className="font-semibold">Hisob ulanmagan</p>
                  <p className="mt-1 text-red-500">
                    Telegram hisobingiz tizimga ulanmagan. Administratoringizga murojaat qiling.
                  </p>
                </>
              ) : error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-600/30">
            <QrCode size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Basyra</h1>
          <p className="text-gray-500 mt-1 text-sm">Shaxsiy kabinet</p>
        </div>

        <Suspense
          fallback={
            <div className="bg-white rounded-2xl shadow-xl p-8 flex justify-center">
              <Loader2 size={28} className="animate-spin text-blue-400" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-gray-400 mt-6">
          Muammo bo&apos;lsa, administrator bilan bog&apos;laning
        </p>
      </div>
    </div>
  );
}
