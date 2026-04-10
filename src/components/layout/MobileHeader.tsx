"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, X, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isSuperadmin } from "@/lib/permissions";
import toast from "react-hot-toast";

export function MobileHeader() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const superadmin = isSuperadmin(user);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/login");
    toast.success("Logged out");
  }

  return (
    <>
      {/* Header bar */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <QrCode size={15} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">AttendTrack</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm"
          aria-label="Account menu"
        >
          {user?.name?.charAt(0).toUpperCase() ?? "?"}
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
            <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
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

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 font-medium text-sm transition-colors"
        >
          <LogOut size={18} />
          Sign out
        </button>

        {/* Safe area spacer */}
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </div>
    </>
  );
}
