"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, BookOpen, Users, QrCode, BarChart3,
  Settings, LogOut, ChevronRight, Shield, UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission, isSuperadmin } from "@/lib/permissions";
import type { PermPage, PermAction } from "@/types";
import toast from "react-hot-toast";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  page: PermPage | null;   // null = always visible
  action: PermAction;
}

const navItems: NavItem[] = [
  { label: "Dashboard",    href: "/",             icon: LayoutDashboard, page: null,             action: "view" },
  { label: "Trainings",    href: "/trainings",    icon: BookOpen,        page: "trainings",      action: "view" },
  { label: "Participants", href: "/participants", icon: Users,           page: "participants",   action: "view" },
  { label: "Scanner",      href: "/scanner",      icon: QrCode,          page: "scanner",        action: "view" },
  { label: "Reports",      href: "/reports",      icon: BarChart3,       page: "reports",        action: "view" },
];

const settingsItems: NavItem[] = [
  { label: "Users & Roles", href: "/settings/users", icon: UserCog,  page: "settings.users", action: "view" },
  { label: "Roles",          href: "/settings/roles", icon: Shield,   page: "settings.roles", action: "view" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const superadmin = isSuperadmin(user);

  function canSee(item: NavItem): boolean {
    if (!item.page) return true;
    return hasPermission(user, item.page, item.action);
  }

  const showSettings = settingsItems.some(canSee);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    toast.success("Logged out");
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.filter(canSee).map((item) => {
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
              {item.label}
              {active && <ChevronRight size={14} className="ml-auto text-blue-400" />}
            </Link>
          );
        })}

        {showSettings && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Settings size={11} /> Settings
              </span>
            </div>
            {settingsItems.filter(canSee).map((item) => {
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
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User info */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
            {user?.name?.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{user?.name || "Loading…"}</div>
            <div className="flex items-center gap-1 text-xs text-gray-500 truncate">
              {superadmin && <Shield size={10} className="text-amber-500 shrink-0" />}
              {user?.role?.name || "Staff"}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
