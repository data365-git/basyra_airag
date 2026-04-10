"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { QrCode, X, LogOut, Shield, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isSuperadmin } from "@/lib/permissions";
import toast from "react-hot-toast";
import { useTranslation } from "@/providers/LanguageProvider";
import type { Language } from "@/providers/LanguageProvider";
import { cn } from "@/lib/utils";

const LANG_OPTIONS: { code: Language; label: string }[] = [
  { code: "uz", label: "UZ" },
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
];

function UserAvatar({
  name,
  avatarUrl,
  size = 11,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size * 4, height: size * 4 }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
          (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute("style");
        }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold"
      style={{ width: size * 4, height: size * 4 }}
    >
      {initials || "?"}
    </div>
  );
}

export function MobileHeader() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const superadmin = isSuperadmin(user);
  const { language, setLanguage, t } = useTranslation();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/login");
    toast.success(t("auth.sign_out"));
  }

  function goToSettings() {
    setOpen(false);
    router.push("/settings/profile");
  }

  return (
    <>
      {/* Header bar — hidden on scanner (scanner covers full screen) */}
      <header className={cn(
        "lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30",
        pathname === "/scanner" && "hidden"
      )}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <QrCode size={15} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">AttendTrack</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0"
          aria-label="Account menu"
        >
          <UserAvatar name={user?.name ?? ""} avatarUrl={user?.avatar_url} size={8} />
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl p-6 transition-transform duration-300 lg:hidden ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* User row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <UserAvatar name={user?.name ?? ""} avatarUrl={user?.avatar_url} size={11} />
            <div>
              <p className="font-semibold text-gray-900 text-sm">{user?.name ?? "Loading…"}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                {superadmin && <Shield size={10} className="text-amber-500 shrink-0" />}
                {user?.role?.name ?? "Staff"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Language switcher */}
        <div className="flex gap-2 mb-3">
          {LANG_OPTIONS.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setLanguage(code)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-semibold transition-colors",
                language === code
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Settings / Profile button */}
        <button
          onClick={goToSettings}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 bg-gray-50 hover:bg-gray-100 font-medium text-sm transition-colors mb-2"
        >
          <Settings size={18} className="text-gray-500" />
          {t("nav.settings")}
        </button>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 font-medium text-sm transition-colors"
        >
          <LogOut size={18} />
          {t("auth.sign_out")}
        </button>

        {/* Safe area spacer */}
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </div>
    </>
  );
}
