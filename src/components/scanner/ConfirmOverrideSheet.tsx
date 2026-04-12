"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/providers/LanguageProvider";
import type { Participant } from "@/types";

interface ConfirmOverrideSheetProps {
  participant: Participant;
  setByAdmin?: string | null;
  setAt?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmOverrideSheet({
  participant,
  setByAdmin,
  setAt,
  onConfirm,
  onCancel,
}: ConfirmOverrideSheetProps) {
  const { t } = useTranslation();

  const timeLabel = setAt
    ? new Date(setAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 px-8 text-center bg-amber-500">
      <AlertTriangle size={48} className="text-white" />

      <div>
        <p className="text-white text-xl font-bold">{t("scanner.confirm.title")}</p>
        <p className="text-white/80 text-base font-semibold mt-1">{participant.full_name}</p>
        {setByAdmin && timeLabel && (
          <p className="text-white/70 text-sm mt-1">
            {t("scanner.confirm.body", { admin: setByAdmin, time: timeLabel })}
          </p>
        )}
      </div>

      <p className="text-white/90 text-base">{t("scanner.confirm.question")}</p>

      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-3 bg-white/20 hover:bg-white/30 active:scale-95 rounded-xl text-white font-medium transition-all"
        >
          {t("scanner.confirm.no")}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-4 py-3 bg-white hover:bg-white/90 active:scale-95 rounded-xl text-amber-700 font-bold transition-all"
        >
          {t("scanner.confirm.yes")}
        </button>
      </div>
    </div>
  );
}
