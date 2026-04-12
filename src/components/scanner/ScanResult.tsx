"use client";

import { CheckCircle, AlertTriangle, XCircle, Lock, Clock, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/providers/LanguageProvider";
import type { ScanResult, Participant } from "@/types";

// ─── Initials avatar ──────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function ParticipantAvatar({
  participant,
  size = "lg",
}: {
  participant: Participant;
  size?: "sm" | "lg";
}) {
  const initials = getInitials(participant.full_name);
  const dim = size === "lg" ? "h-20 w-20 text-3xl" : "h-12 w-12 text-lg";

  if (participant.photo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={participant.photo_url}
        alt={participant.full_name}
        className={cn("rounded-full object-cover border-4 border-white/30", dim)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold text-white bg-white/20 border-4 border-white/30",
        dim
      )}
    >
      {initials}
    </div>
  );
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

interface ScanResultOverlayProps {
  result: ScanResult | null;
  isOffline?: boolean;
}

export function ScanResultOverlay({ result }: ScanResultOverlayProps) {
  const { t } = useTranslation();

  if (!result) return null;

  // ── Success / late: name is the hero ────────────────────────────────────────
  if (result.type === "success" || result.type === "late") {
    const isLate = result.type === "late";
    return (
      <div
        className={cn(
          "absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-8 text-center",
          isLate ? "bg-amber-500" : "bg-green-500",
          "animate-pulse-once"
        )}
      >
        {/* Status label */}
        <div className="flex items-center gap-2 text-white/90 text-sm font-medium uppercase tracking-wider">
          <CheckCircle size={16} />
          {t(isLate ? "scanner.result.late" : "scanner.result.success")}
        </div>

        {/* Avatar — the most prominent element */}
        {result.participant && (
          <ParticipantAvatar participant={result.participant} size="lg" />
        )}

        {/* Name — large, bold, operator reads this first */}
        {result.participant && (
          <p className="text-white text-2xl font-bold leading-tight">
            {result.participant.full_name}
          </p>
        )}

        {/* Late detail */}
        {isLate && result.minutesLate !== undefined && result.minutesLate > 0 && (
          <p className="text-white/80 text-sm">
            {t("scanner.result.late_minutes", { n: String(result.minutesLate) })}
          </p>
        )}
      </div>
    );
  }

  // ── Already recorded: show who, so operator can spot the mix-up ─────────────
  if (result.type === "already_recorded" || result.type === "already_scanned") {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-8 text-center bg-yellow-500 animate-pulse-once">
        <AlertTriangle size={36} className="text-white" />
        <p className="text-white text-xl font-bold">{t("scanner.result.already_scanned")}</p>
        {result.participant && (
          <>
            <ParticipantAvatar participant={result.participant} size="sm" />
            <p className="text-white/90 text-base font-semibold">{result.participant.full_name}</p>
          </>
        )}
      </div>
    );
  }

  // ── Offline queue: no participant confirmed yet ───────────────────────────────
  if (result.type === "queued_offline") {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-8 text-center bg-amber-500 animate-pulse-once">
        <WifiOff size={48} className="text-white" />
        <p className="text-white text-xl font-bold">{t("scanner.result.queued_offline")}</p>
        <p className="text-white/80 text-xs">{t("scanner.result.saved_offline")}</p>
      </div>
    );
  }

  // ── All other states (errors / blocked) ──────────────────────────────────────
  const errorConfig: Record<string, { bg: string; icon: React.ReactNode; title: string }> = {
    not_enrolled: {
      bg: "bg-orange-500",
      icon: <AlertTriangle size={48} className="text-white" />,
      title: t("scanner.result.not_enrolled"),
    },
    excused: {
      bg: "bg-purple-600",
      icon: <CheckCircle size={48} className="text-white" />,
      title: t("scanner.result.excused"),
    },
    not_started: {
      bg: "bg-gray-700",
      icon: <Clock size={48} className="text-white" />,
      title: t("scanner.result.session_closed"),
    },
    window_closed: {
      bg: "bg-gray-700",
      icon: <Lock size={48} className="text-white" />,
      title: t("scanner.result.session_closed"),
    },
    session_closed: {
      bg: "bg-gray-700",
      icon: <Lock size={48} className="text-white" />,
      title: t("scanner.result.session_closed"),
    },
    session_cancelled: {
      bg: "bg-red-700",
      icon: <XCircle size={48} className="text-white" />,
      title: t("scanner.session_cancelled"),
    },
    force_closed: {
      bg: "bg-red-700",
      icon: <Lock size={48} className="text-white" />,
      title: t("scanner.session_force_closed"),
    },
    unknown: {
      bg: "bg-red-500",
      icon: <XCircle size={48} className="text-white" />,
      title: t("scanner.result.unknown"),
    },
  };

  const c = errorConfig[result.type] ?? errorConfig.unknown;

  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-8 text-center",
        c.bg,
        "animate-pulse-once"
      )}
    >
      {c.icon}
      <p className="text-white text-xl font-bold">{c.title}</p>
      {result.participant && (
        <p className="text-white/80 text-base">{result.participant.full_name}</p>
      )}
    </div>
  );
}
