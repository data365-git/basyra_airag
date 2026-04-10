"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/providers/LanguageProvider";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "green" | "red" | "yellow" | "blue" | "gray" | "orange" | "purple";
  size?: "sm" | "md";
  className?: string;
  dot?: boolean;
}

const variantClasses = {
  green:  "bg-green-100 text-green-800",
  red:    "bg-red-100 text-red-800",
  yellow: "bg-yellow-100 text-yellow-800",
  blue:   "bg-blue-100 text-blue-800",
  gray:   "bg-gray-100 text-gray-700",
  orange: "bg-orange-100 text-orange-800",
  purple: "bg-purple-100 text-purple-800",
};

const dotClasses = {
  green:  "bg-green-500",
  red:    "bg-red-500",
  yellow: "bg-yellow-500",
  blue:   "bg-blue-500",
  gray:   "bg-gray-400",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
};

export function Badge({ children, variant = "gray", size = "sm", className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full",
        size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1",
        variantClasses[variant],
        className
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", dotClasses[variant])} />}
      {children}
    </span>
  );
}

export function AttendanceBadge({ status }: { status: string }) {
  const { t } = useTranslation();

  const config: Record<string, { variant: BadgeProps["variant"]; icon: string; key: string }> = {
    present: { variant: "green",  icon: "✅", key: "common.status.present" },
    absent:  { variant: "red",    icon: "❌", key: "common.status.absent"  },
    late:    { variant: "yellow", icon: "⏰", key: "common.status.late"    },
    excused: { variant: "blue",   icon: "🔵", key: "common.status.excused" },
    pending: { variant: "gray",   icon: "—",  key: "common.status.pending" },
  };

  const c = config[status] ?? config.pending;

  return (
    <Badge variant={c.variant}>
      <span>{c.icon}</span> {t(c.key)}
    </Badge>
  );
}

export function SessionStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();

  const config: Record<string, { variant: BadgeProps["variant"]; key: string }> = {
    upcoming: { variant: "gray",  key: "common.status.upcoming" },
    open:     { variant: "green", key: "common.status.open"     },
    closed:   { variant: "red",   key: "common.status.closed"   },
  };

  const c = config[status] ?? config.upcoming;

  return <Badge variant={c.variant} dot>{t(c.key)}</Badge>;
}

export function TrainingStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();

  const config: Record<string, { variant: BadgeProps["variant"]; key: string }> = {
    upcoming:  { variant: "blue",  key: "common.status.upcoming"  },
    active:    { variant: "green", key: "common.status.active"    },
    completed: { variant: "gray",  key: "common.status.completed" },
  };

  const c = config[status] ?? config.upcoming;

  return <Badge variant={c.variant} dot>{t(c.key)}</Badge>;
}
