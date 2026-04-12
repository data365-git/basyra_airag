"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
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
  onConfirm: () => void;
  onCancel:  () => void;
}

export function ConfirmOverrideSheet({
  name,
  existingStatus,
  existingMethod,
  existingScannedAt,
  newStatus,
  onConfirm,
  onCancel,
}: ConfirmOverrideSheetProps) {
  const { t } = useTranslation();

  // Human-readable status label (Uzbek via i18n)
  function statusLabel(s: string): string {
    if (s === "present") return t("scanner.status.present");
    if (s === "late")    return t("scanner.status.late");
    if (s === "absent")  return t("scanner.status.absent");
    return s;
  }

  // Format ISO timestamp to HH:mm in Tashkent timezone
  const existingTime = existingScannedAt
    ? new Date(existingScannedAt).toLocaleTimeString("uz-UZ", {
        hour:     "2-digit",
        minute:   "2-digit",
        timeZone: "Asia/Tashkent",
      })
    : null;

  const isManual = existingMethod === "manual";

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-0 bg-black/70">
      {/* Bottom sheet panel */}
      <div className="absolute bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl px-6 pt-5 pb-8 flex flex-col gap-5">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto" />

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-amber-400" />
          </div>
          <p className="text-white font-bold text-lg leading-snug">
            {t("scanner.confirm.title")}
          </p>
        </div>

        {/* Name */}
        <p className="text-white text-xl font-bold -mt-1">{name || t("scanner.confirm.unknown")}</p>

        {/* Current status */}
        <div className="bg-white/5 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-white/50 text-xs uppercase tracking-wide font-medium">
            {t("scanner.confirm.currently")}
          </p>
          <div className="flex items-center gap-2">
            <span
              className={
                existingStatus === "present"
                  ? "text-green-400 font-bold text-base"
                  : existingStatus === "late"
                  ? "text-amber-400 font-bold text-base"
                  : "text-red-400 font-bold text-base"
              }
            >
              {statusLabel(existingStatus)}
            </span>
            {existingTime && (
              <span className="text-white/40 text-sm">({existingTime})</span>
            )}
          </div>
          {isManual && (
            <p className="text-white/40 text-xs">{t("scanner.confirm.set_by_admin")}</p>
          )}
        </div>

        {/* What it will become */}
        <div className="flex items-center gap-3">
          <ArrowRight size={16} className="text-white/30 shrink-0" />
          <div>
            <p className="text-white/50 text-xs">{t("scanner.confirm.will_become")}</p>
            <p
              className={
                newStatus === "present"
                  ? "text-green-400 font-bold text-base mt-0.5"
                  : "text-amber-400 font-bold text-base mt-0.5"
              }
            >
              {statusLabel(newStatus)}
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 mt-1">
          <button
            onClick={onConfirm}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-xl text-white font-bold text-base transition-all"
          >
            {t("scanner.confirm.yes")}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3.5 bg-white/10 hover:bg-white/20 active:scale-[0.98] rounded-xl text-white/80 font-medium text-base transition-all"
          >
            {t("scanner.confirm.no")}
          </button>
        </div>
      </div>
    </div>
  );
}
