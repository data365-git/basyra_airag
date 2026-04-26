"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/providers/LanguageProvider";

const CHATBOT_TABS = [
  { href: "/chatbot",               labelKey: "chatbot.tab_overview",       exact: true },
  { href: "/chatbot/conversations",  labelKey: "chatbot.tab_conversations"  },
  { href: "/chatbot/users",         labelKey: "chatbot.tab_users"           },
  { href: "/chatbot/content",       labelKey: "chatbot.tab_content"         },
  { href: "/chatbot/feedback",      labelKey: "chatbot.tab_feedback"        },
  { href: "/chatbot/broadcast",     labelKey: "chatbot.tab_broadcast"       },
  { href: "/chatbot/settings",      labelKey: "chatbot.tab_settings"        },
];

export default function ChatbotLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sub-nav tabs */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto -mb-px scrollbar-hide">
            {CHATBOT_TABS.map((tab) => {
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
