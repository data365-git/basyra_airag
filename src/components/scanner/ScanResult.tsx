"use client";

import { CheckCircle, AlertTriangle, XCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/providers/LanguageProvider";
import type { ScanResult } from "@/types";

interface ScanResultOverlayProps {
  result: ScanResult | null;
  isOffline?: boolean;
}

export function ScanResultOverlay({ result, isOffline }: ScanResultOverlayProps) {
  const { t } = useTranslation();

  if (!result) return null;

  const config = {
    success: {
      bg: "bg-green-500",
      icon: <CheckCircle size={48} className="text-white" />,
      title: t("scanner.result.success"),
      textColor: "text-white",
    },
    already_scanned: {
      bg: "bg-yellow-500",
      icon: <AlertTriangle size={48} className="text-white" />,
      title: t("scanner.result.already_scanned"),
      textColor: "text-white",
    },
    not_enrolled: {
      bg: "bg-orange-500",
      icon: <AlertTriangle size={48} className="text-white" />,
      title: t("scanner.result.not_enrolled"),
      textColor: "text-white",
    },
    unknown: {
      bg: "bg-red-500",
      icon: <XCircle size={48} className="text-white" />,
      title: t("scanner.result.unknown"),
      textColor: "text-white",
    },
    session_closed: {
      bg: "bg-gray-700",
      icon: <Lock size={48} className="text-white" />,
      title: t("scanner.result.session_closed"),
      textColor: "text-white",
    },
  };

  const c = config[result.type as keyof typeof config] ?? config.unknown;

  return (
    <div className={cn(
      "absolute inset-0 z-20 flex flex-col items-center justify-center",
      c.bg,
      "animate-pulse-once"
    )}>
      {c.icon}
      <h2 className={cn("text-2xl font-bold mt-4", c.textColor)}>{c.title}</h2>
      {result.participant && (
        <p className={cn("text-lg mt-2 font-medium", c.textColor)}>
          {result.participant.full_name}
        </p>
      )}
      {result.message && result.type === "not_enrolled" && (
        <p className="text-white/80 text-sm mt-1">{result.message}</p>
      )}
      {isOffline && result.type === "success" && (
        <p className="text-white/70 text-xs mt-3">{t("scanner.result.saved_offline")}</p>
      )}
    </div>
  );
}
