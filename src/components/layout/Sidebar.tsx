"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BookOpen, Users, QrCode, BarChart3,
  Settings, ChevronRight, ChevronLeft, Send, ClipboardList,
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
  { label: "nav.homeworks",    href: "/homeworks",    icon: ClipboardList,   page: "trainings",    action: "view" },
  { label: "nav.participants", href: "/participants", icon: Users,           page: "participants", action: "view" },
  { label: "nav.scanner",      href: "/scanner",      icon: QrCode,          page: "scanner",      action: "view" },
  { label: "nav.reports",      href: "/reports",      icon: BarChart3,       page: "reports",      action: "view" },
  { label: "nav.telegram",     href: "/telegram",     icon: Send,            page: "participants", action: "edit" },
];

function SidebarSkeleton() {
  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 h-screen sticky top-0">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <QrCode size={18} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-gray-900">AttendTrack</div>
          <div className="text-xs text-gray-500">Training Attendance</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-3 space-y-1 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-9 bg-gray-100 rounded-lg" />
        ))}
      </nav>
      <div className="px-3 pb-2 border-t border-gray-100 pt-2">
        <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    </aside>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  if (loading) return <SidebarSkeleton />;

  function canSee(item: NavItem): boolean {
    if (!item.page) return true;
    return hasPermission(user, item.page, item.action);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar_collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col bg-white border-r border-gray-200 h-screen sticky top-0 transition-all duration-200 overflow-hidden",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="relative flex items-center gap-3 px-3 py-4 border-b border-gray-100">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <QrCode size={18} className="text-white" />
        </div>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 whitespace-nowrap",
            collapsed ? "w-0 opacity-0" : "w-full opacity-100"
          )}
        >
          <div className="text-sm font-bold text-gray-900">AttendTrack</div>
          <div className="text-xs text-gray-500">Training Attendance</div>
        </div>

        {/* Toggle chevron — floats on the right edge */}
        <button
          onClick={toggle}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm z-10 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {mainNavItems.filter(canSee).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? t(item.label) : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              )}
            >
              <item.icon
                size={18}
                className={cn("shrink-0", active ? "text-blue-600" : "text-gray-400")}
              />
              <span
                className={cn(
                  "flex-1 overflow-hidden whitespace-nowrap transition-all duration-200",
                  collapsed ? "w-0 opacity-0" : "opacity-100"
                )}
              >
                {t(item.label)}
              </span>
              {!collapsed && active && (
                <ChevronRight size={14} className="ml-auto text-blue-400 shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Settings link */}
      <div className="px-2 pb-1 border-t border-gray-100 pt-2">
        {(() => {
          const active = isActive("/settings");
          return (
            <Link
              href="/settings"
              title={collapsed ? t("nav.settings") : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              )}
            >
              <Settings
                size={18}
                className={cn("shrink-0", active ? "text-blue-600" : "text-gray-400")}
              />
              <span
                className={cn(
                  "flex-1 overflow-hidden whitespace-nowrap transition-all duration-200",
                  collapsed ? "w-0 opacity-0" : "opacity-100"
                )}
              >
                {t("nav.settings")}
              </span>
              {!collapsed && active && (
                <ChevronRight size={14} className="ml-auto text-blue-400 shrink-0" />
              )}
            </Link>
          );
        })()}
      </div>

    </aside>
  );
}
