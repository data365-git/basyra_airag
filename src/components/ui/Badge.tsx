import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "green" | "red" | "yellow" | "blue" | "gray" | "orange" | "purple";
  size?: "sm" | "md";
  className?: string;
  dot?: boolean;
}

const variantClasses = {
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-800",
  yellow: "bg-yellow-100 text-yellow-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-gray-100 text-gray-700",
  orange: "bg-orange-100 text-orange-800",
  purple: "bg-purple-100 text-purple-800",
};

const dotClasses = {
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  blue: "bg-blue-500",
  gray: "bg-gray-400",
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
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full", dotClasses[variant])} />
      )}
      {children}
    </span>
  );
}

export function AttendanceBadge({ status }: { status: string }) {
  const config: Record<string, { variant: BadgeProps["variant"]; label: string; icon: string }> = {
    present: { variant: "green", label: "Present", icon: "✅" },
    absent: { variant: "red", label: "Absent", icon: "❌" },
    late: { variant: "yellow", label: "Late", icon: "⏰" },
    excused: { variant: "blue", label: "Excused", icon: "🔵" },
    pending: { variant: "gray", label: "Pending", icon: "—" },
  };

  const c = config[status] || config.pending;

  return (
    <Badge variant={c.variant}>
      <span>{c.icon}</span> {c.label}
    </Badge>
  );
}

export function SessionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: BadgeProps["variant"]; label: string }> = {
    upcoming: { variant: "gray", label: "Upcoming" },
    open: { variant: "green", label: "Open" },
    closed: { variant: "red", label: "Closed" },
  };

  const c = config[status] || config.upcoming;

  return <Badge variant={c.variant} dot>{c.label}</Badge>;
}

export function TrainingStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: BadgeProps["variant"]; label: string }> = {
    upcoming: { variant: "blue", label: "Upcoming" },
    active: { variant: "green", label: "Active" },
    completed: { variant: "gray", label: "Completed" },
  };

  const c = config[status] || config.upcoming;

  return <Badge variant={c.variant} dot>{c.label}</Badge>;
}
