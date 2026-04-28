"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BookOpen, Users, QrCode, BarChart3,
  Settings, ChevronRight, ChevronLeft, ClipboardList, Bot,
  ArrowLeft, MessageSquare, Database, MessageCircleWarning,
  Megaphone, SlidersHorizontal, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import type { PermPage, PermAction } from "@/types";
import { useTranslation } from "@/providers/LanguageProvider";

interface NavItem {
  label: string;
  fallback: string;
  href: string;
  icon: React.ElementType;
  page: PermPage | null;   // null = always visible
  action: PermAction;
}

const mainNavItems: NavItem[] = [
  { label: "nav.dashboard",    fallback: "Dashboard",    href: "/",             icon: LayoutDashboard, page: null,           action: "view" },
  { label: "nav.trainings",    fallback: "Trainings",    href: "/trainings",    icon: BookOpen,        page: "trainings",    action: "view" },
  { label: "nav.homeworks",    fallback: "Homeworks",    href: "/homeworks",    icon: ClipboardList,   page: "trainings",    action: "view" },
  { label: "nav.participants", fallback: "Participants", href: "/participants", icon: Users,           page: "participants", action: "view" },
  { label: "nav.scanner",      fallback: "Scanner",      href: "/scanner",      icon: QrCode,          page: "scanner",      action: "view" },
  { label: "nav.reports",      fallback: "Reports",      href: "/reports",      icon: BarChart3,       page: "reports",      action: "view" },
];

const botNavItems = [
  { label: "chatbot.tab_overview",  fallback: "Overview",       href: "/chatbot",          icon: LayoutDashboard,      exact: true, actions: ["view"] },
  { label: "nav.chat",              fallback: "Chat",           href: "/chat",             icon: MessageSquare,                    actions: ["conversations", "view"] },
  { label: "nav.knowledge_base",    fallback: "Knowledge base", href: "/chatbot/content",  icon: Database,                        actions: ["content"] },
  { label: "nav.complaints",        fallback: "Feedback",       href: "/chatbot/feedback", icon: MessageCircleWarning,             actions: ["conversations", "view"] },
  { label: "nav.ratings",           fallback: "Ratings",        href: "/chatbot/ratings",  icon: Star,                                actions: ["conversations", "view"] },
] satisfies Array<{
  label: string;
  fallback: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  actions: PermAction[];
}>;

const chatbotEntry: NavItem = {
  label: "nav.bot_workspace",
  fallback: "Chat-bot",
  href: "/chatbot",
  icon: Bot,
  page: "chatbot",
  action: "view",
};

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
  const inBotWorkspace = pathname.startsWith("/chatbot") || pathname.startsWith("/bot");

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar_collapsed", String(!prev));
      return !prev;
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <SidebarSkeleton />;

  function canSee(item: NavItem): boolean {
    if (!item.page) return true;
    return hasPermission(user, item.page, item.action);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const isBotNavActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const botSettingsActive = isActive("/chatbot/settings");
  const lmsSettingsActive = isActive("/settings");

  return (
    <aside
      className={cn(
        "relative hidden lg:flex flex-col bg-white border-r border-gray-200 h-screen sticky top-0 transition-all duration-200 overflow-hidden",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-gray-100">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <QrCode size={18} className="text-white" />
        </div>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 whitespace-nowrap",
            collapsed ? "w-0 opacity-0" : "w-full opacity-100"
          )}
        >
          <div className="text-sm font-bold text-gray-900">
            AttendTrack{inBotWorkspace ? " · Bot" : ""}
          </div>
          <div className="text-xs text-gray-500">Training Attendance</div>
        </div>
      </div>

      {/* Floating edge toggle button */}
      <button
        onClick={toggle}
        title={collapsed ? "Ochish (⌘B)" : "Yopish (⌘B)"}
        className="absolute right-[-12px] top-[72px] z-20 flex w-6 h-6 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          : <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
        }
      </button>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {inBotWorkspace
          ? botNavItems
              .filter((item) =>
                item.actions.some((action) => hasPermission(user, "chatbot", action))
              )
              .map((item) => {
                const active = isBotNavActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? t(item.label, item.fallback) : undefined}
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
                      {t(item.label, item.fallback)}
                    </span>
                    {!collapsed && active && (
                      <ChevronRight size={14} className="ml-auto text-blue-400 shrink-0" />
                    )}
                  </Link>
                );
              })
          : mainNavItems.filter(canSee).map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? t(item.label, item.fallback) : undefined}
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
                    {t(item.label, item.fallback)}
                  </span>
                  {!collapsed && active && (
                    <ChevronRight size={14} className="ml-auto text-blue-400 shrink-0" />
                  )}
                </Link>
              );
            })
        }
      </nav>

      {/* Lower links */}
      <div className="px-2 pb-1 border-t border-gray-100 pt-2">
        {inBotWorkspace ? (
          <>
            {/* Workspace switcher: back to LMS */}
            <Link
              href="/"
              title={collapsed ? t("nav.lms_workspace", "Back to LMS") : undefined}
              className={cn(
                "mb-1 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              )}
            >
              <ArrowLeft size={18} className="shrink-0 text-gray-400" />
              <span
                className={cn(
                  "flex-1 overflow-hidden whitespace-nowrap transition-all duration-200",
                  collapsed ? "w-0 opacity-0" : "opacity-100"
                )}
              >
                {t("nav.lms_workspace", "Back to LMS")}
              </span>
            </Link>
            {/* Bot settings */}
            <Link
              href="/chatbot/settings"
              title={collapsed ? t("chatbot.sidebar_settings", "Bot settings") : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                botSettingsActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              )}
            >
              <SlidersHorizontal
                size={18}
                className={cn("shrink-0", botSettingsActive ? "text-blue-600" : "text-gray-400")}
              />
              <span
                className={cn(
                  "flex-1 overflow-hidden whitespace-nowrap transition-all duration-200",
                  collapsed ? "w-0 opacity-0" : "opacity-100"
                )}
              >
                {t("chatbot.sidebar_settings", "Bot settings")}
              </span>
              {!collapsed && botSettingsActive && (
                <ChevronRight size={14} className="ml-auto text-blue-400 shrink-0" />
              )}
            </Link>
          </>
        ) : (
          <>
            {/* Workspace switcher: go to Bot */}
            {canSee(chatbotEntry) && (() => {
              const active = isActive(chatbotEntry.href);
              return (
                <Link
                  href={chatbotEntry.href}
                  title={collapsed ? t(chatbotEntry.label, chatbotEntry.fallback) : undefined}
                  className={cn(
                    "mb-1 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900",
                    active ? "border-blue-100 bg-blue-50 text-blue-700" : "",
                    collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
                  )}
                >
                  <chatbotEntry.icon
                    size={18}
                    className={cn("shrink-0", active ? "text-blue-600" : "text-gray-400")}
                  />
                  <span
                    className={cn(
                      "flex-1 overflow-hidden whitespace-nowrap transition-all duration-200",
                      collapsed ? "w-0 opacity-0" : "opacity-100"
                    )}
                  >
                    {t(chatbotEntry.label, chatbotEntry.fallback)}
                  </span>
                  {!collapsed && active && (
                    <ChevronRight size={14} className="ml-auto text-blue-400 shrink-0" />
                  )}
                </Link>
              );
            })()}
            {/* LMS settings */}
            <Link
              href="/settings"
              title={collapsed ? t("nav.settings") : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                lmsSettingsActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              )}
            >
              <Settings
                size={18}
                className={cn("shrink-0", lmsSettingsActive ? "text-blue-600" : "text-gray-400")}
              />
              <span
                className={cn(
                  "flex-1 overflow-hidden whitespace-nowrap transition-all duration-200",
                  collapsed ? "w-0 opacity-0" : "opacity-100"
                )}
              >
                {t("nav.settings")}
              </span>
              {!collapsed && lmsSettingsActive && (
                <ChevronRight size={14} className="ml-auto text-blue-400 shrink-0" />
              )}
            </Link>
          </>
        )}
      </div>

    </aside>
  );
}
