"use client";

import { CheckCircle, AlertTriangle, XCircle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScanResult } from "@/types";

interface ScanResultOverlayProps {
  result: ScanResult | null;
  isOffline?: boolean;
}

export function ScanResultOverlay({ result, isOffline }: ScanResultOverlayProps) {
  if (!result) return null;

  const config = {
    success: {
      bg: "bg-green-500",
      icon: <CheckCircle size={48} className="text-white" />,
      title: "Marked Present",
      textColor: "text-white",
    },
    already_scanned: {
      bg: "bg-yellow-500",
      icon: <AlertTriangle size={48} className="text-white" />,
      title: "Already Scanned",
      textColor: "text-white",
    },
    not_enrolled: {
      bg: "bg-orange-500",
      icon: <AlertTriangle size={48} className="text-white" />,
      title: "Not Enrolled",
      textColor: "text-white",
    },
    unknown: {
      bg: "bg-red-500",
      icon: <XCircle size={48} className="text-white" />,
      title: "Unknown QR Code",
      textColor: "text-white",
    },
    session_closed: {
      bg: "bg-gray-700",
      icon: <WifiOff size={48} className="text-white" />,
      title: "Session Closed",
      textColor: "text-white",
    },
  };

  const c = config[result.type];

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
        <p className="text-white/70 text-xs mt-3">Saved locally — will sync when online</p>
      )}
    </div>
  );
}
