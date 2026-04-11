"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BookOpen, Users, QrCode, BarChart3,
  Settings, ChevronRight, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import type { PermPage, PermAction } from "@/types";
import { useTranslation } from "@/providers/LanguageProvider";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  page: PermPage | null;   // null = always visible
  action: PermAction;
}

const mainNavItems: NavItem[] = [
  { label: "nav.dashboard",    href: "/",             icon: LayoutDashboard, page: null,           action: "view" },
  { label: "nav.trainings",    href: "/trainings",    icon: BookOpen,        page: "trainings",    action: "view" },
  { label: "nav.participants", href: "/participants", icon: Users,           page: "participants", action: "view" },
  { label: "nav.scanner",      href: "/scanner",      icon: QrCode,          page: "scanner",      action: "view" },
  { label: "nav.reports",      href: "/reports",      icon: BarChart3,       page: "reports",      action: "view" },
];

function UserAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-8 h-8 rounded-full object-cover"
        onError={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = "none";
          const sibling = el.nextSibling as HTMLElement | null;
          sibling?.removeAttribute("style");
        }}
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
      {initials || "?"}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslation();

  const superadmin = user?.role?.is_superadmin ?? false;

  function canSee(item: NavItem): boolean {
    if (!item.page) return true;
    return hasPermission(user, item.page, item.action);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <QrCode size={18} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-gray-900">AttendTrack</div>
          <div className="text-xs text-gray-500">Training Attendance</div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {mainNavItems.filter(canSee).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon size={18} className={active ? "text-blue-600" : "text-gray-400"} />
              {t(item.label)}
              {active && <ChevronRight size={14} className="ml-auto text-blue-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Divider + Settings */}
      <div className="px-3 pb-1 border-t border-gray-100 pt-2">
        {(() => {
          const active = isActive("/settings");
          return (
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Settings size={18} className={active ? "text-blue-600" : "text-gray-400"} />
              {t("nav.settings")}
              {active && <ChevronRight size={14} className="ml-auto text-blue-400" />}
            </Link>
          );
        })()}
      </div>

      {/* User strip — read-only */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <UserAvatar name={user?.name ?? ""} avatarUrl={user?.avatar_url} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{user?.name || "Loading…"}</div>
            <div className="flex items-center gap-1 text-xs text-gray-500 truncate">
              {superadmin && <Shield size={10} className="text-amber-500 shrink-0" />}
              {user?.role?.name || "Staff"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
