"use client";

import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "@/providers/LanguageProvider";

interface ConfirmOverrideSheetProps {
  /** Participant display name */
  name: string;
  /** What the record currently says: "present" | "late" | "absent" */
  existingStatus: string;
  /** How it was set: "qr" | "manual" | "system" */
  existingMethod: string;
  /** ISO timestamp of when the existing record was written (may be null) */
  existingScannedAt: string | null;
  /** What this rescan would change the status to */
  newStatus: string;
  /** True while the confirm API call is in flight */
  isLoading: boolean;
  onConfirm: () => void;
  onCancel:  () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatLocalTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("uz-UZ", {
      hour:     "2-digit",
      minute:   "2-digit",
      timeZone: "Asia/Tashkent",
    });
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfirmOverrideSheet({
  name,
  existingStatus,
  existingMethod,
  existingScannedAt,
  newStatus,
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmOverrideSheetProps) {
  const { t } = useTranslation();

  function statusLabel(s: string): string {
    if (s === "present") return t("scanner.status.present");
    if (s === "late")    return t("scanner.status.late");
    if (s === "absent")  return t("scanner.status.absent");
    return s;
  }

  function statusColor(s: string): string {
    if (s === "present") return "text-emerald-600";
    if (s === "late")    return "text-amber-600";
    return "text-red-500";
  }

  const existingTime = formatLocalTime(existingScannedAt);
  const nowTime = new Date().toLocaleTimeString("uz-UZ", {
    hour:     "2-digit",
    minute:   "2-digit",
    timeZone: "Asia/Tashkent",
  });
  const initials = getInitials(name || "?");
  const isManual = existingMethod === "manual";

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-end justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={isLoading ? undefined : onCancel}
      />

      {/* Sheet — white, slides up from bottom */}
      <div className="relative w-full bg-white rounded-t-3xl px-6 pt-4 pb-10 flex flex-col gap-5 shadow-2xl">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />

        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
            <RotateCcw size={26} className="text-amber-600" />
          </div>
        </div>

        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-2 -mt-1">
          <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center text-gray-700 font-bold text-xl">
            {initials || "?"}
          </div>
          <p className="text-gray-900 font-bold text-xl text-center leading-tight">
            {name || t("scanner.confirm.unknown")}
          </p>
          {isManual && (
            <p className="text-gray-400 text-xs text-center">
              {t("scanner.confirm.set_by_admin")}
            </p>
          )}
        </div>

        {/* Before / After status */}
        <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-4">
          {/* Current */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">
              {t("scanner.confirm.currently")}
            </p>
            <p className={`font-bold text-base ${statusColor(existingStatus)}`}>
              {statusLabel(existingStatus)}
            </p>
            <p className="text-gray-400 text-xs">{existingTime ?? "—"}</p>
          </div>

          <ArrowRight size={20} className="text-gray-300 shrink-0" />

          {/* New */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">
              {t("scanner.confirm.will_become")}
            </p>
            <p className={`font-bold text-base ${statusColor(newStatus)}`}>
              {statusLabel(newStatus)}
            </p>
            <p className="text-gray-400 text-xs">{nowTime}</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-base transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t("scanner.confirm.saving")}
              </>
            ) : (
              t("scanner.confirm.yes")
            )}
          </button>

          <button
            onClick={onCancel}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-[0.98] text-gray-700 font-medium text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("scanner.confirm.no")}
          </button>
        </div>
      </div>
    </div>
  );
}
