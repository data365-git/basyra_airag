"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/providers/LanguageProvider";
import type { PermAction } from "@/types";

const CHATBOT_TABS = [
  { href: "/chatbot",               labelKey: "chatbot.tab_overview",       exact: true, actions: ["view"] },
  { href: "/chatbot/conversations",  labelKey: "chatbot.tab_conversations",               actions: ["conversations"] },
  { href: "/chatbot/users",         labelKey: "chatbot.tab_users",                       actions: ["conversations"] },
  { href: "/chatbot/content",       labelKey: "chatbot.tab_content",                     actions: ["content"] },
  { href: "/chatbot/feedback",      labelKey: "chatbot.tab_feedback",                    actions: ["conversations", "view"] },
  { href: "/chatbot/broadcast",     labelKey: "chatbot.tab_broadcast",                   actions: ["broadcast"] },
  { href: "/chatbot/settings",      labelKey: "chatbot.tab_settings",                    actions: ["settings"] },
] satisfies Array<{
  href: string;
  labelKey: string;
  exact?: boolean;
  actions: PermAction[];
}>;

export default function ChatbotLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const visibleTabs = loading
    ? []
    : CHATBOT_TABS.filter((tab) =>
        tab.actions.some((action) => hasPermission(user, "chatbot", action))
      );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sub-nav tabs */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto -mb-px scrollbar-hide">
            {visibleTabs.map((tab) => {
              const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "whitespace-nowrap py-3 px-3 text-sm font-medium border-b-2 transition-colors shrink-0",
                    active
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  {t(tab.labelKey)}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="flex-1 p-4 sm:p-6">{children}</div>
    </div>
  );
}
