"use client";

import { RotateCcw } from "lucide-react";
import { useTranslation } from "@/providers/LanguageProvider";
import { cn } from "@/lib/utils";

interface Props {
  name:              string;
  existingStatus:    string;
  existingMethod:    string;
  existingScannedAt: string | null;
  newStatus:         string;
  isLoading:         boolean;
  onConfirm:         () => void;
  onCancel:          () => void;
}

function statusLabel(status: string, method: string): string {
  if (status === "absent" && method === "system") return "Sababsiz kelmadi (tizim)";
  if (status === "absent")   return "Kelmadi";
  if (status === "present")  return "Keldi";
  if (status === "late")     return "Kech qoldi";
  if (status === "excused")  return "Sababli";
  return status;
}

export function ConfirmOverrideSheet({
  name,
  existingStatus,
  existingMethod,
  existingScannedAt,
  newStatus,
  isLoading,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      {/* Backdrop — intentionally non-dismissible so operator must choose */}
      <div className="absolute inset-0 bg-black/70" />

      <div className="relative bg-gray-900 rounded-t-3xl px-5 pt-5 pb-8 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
          <RotateCcw size={15} />
          <span>⚠ TASDIQLASH KERAK</span>
        </div>

        {/* Name */}
        <p className="text-white text-xl font-bold leading-tight">{name}</p>

        {/* Status change */}
        <div className="bg-white/10 rounded-xl px-4 py-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/50">Hozirgi holat</span>
            <span className="text-white font-medium">{statusLabel(existingStatus, existingMethod)}</span>
          </div>
          {existingScannedAt && (
            <div className="flex justify-between">
              <span className="text-white/50">Belgilangan vaqt</span>
              <span className="text-white/80 text-xs">
                {new Date(existingScannedAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-white/10 pt-2">
            <span className="text-white/50">Yangi holat</span>
            <span className={cn(
              "font-semibold",
              newStatus === "present" ? "text-green-400" : newStatus === "late" ? "text-amber-400" : "text-white"
            )}>
              {statusLabel(newStatus, "qr")}
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white/80 text-sm font-medium disabled:opacity-40"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-[2] py-5 text-lg shadow-lg shadow-blue-600/40 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="animate-pulse">...</span>
            ) : (
              <><RotateCcw size={18} /> Yangilash</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
