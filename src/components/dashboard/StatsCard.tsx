import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: "blue" | "green" | "yellow" | "purple" | "red";
  trend?: { value: number; label: string };
}

const colorMap = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", iconBg: "bg-blue-100" },
  green: { bg: "bg-green-50", icon: "text-green-600", iconBg: "bg-green-100" },
  yellow: { bg: "bg-yellow-50", icon: "text-yellow-600", iconBg: "bg-yellow-100" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", iconBg: "bg-purple-100" },
  red: { bg: "bg-red-50", icon: "text-red-600", iconBg: "bg-red-100" },
};

export function StatsCard({ title, value, subtitle, icon: Icon, color = "blue", trend }: StatsCardProps) {
  const colors = colorMap[color];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <p className={cn("text-xs font-medium mt-1", trend.value >= 0 ? "text-green-600" : "text-red-600")}>
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colors.iconBg)}>
          <Icon size={20} className={colors.icon} />
        </div>
      </div>
    </div>
  );
}
