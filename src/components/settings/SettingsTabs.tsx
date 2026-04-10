"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/hooks/useAuth";
import { isSuperadmin } from "@/lib/permissions";

const TABS = [
  { href: "/settings/users",        label: "Users",        perm: "settings.users"        },
  { href: "/settings/roles",        label: "Roles",        perm: "settings.roles"        },
  { href: "/settings/categories",   label: "Categories",   perm: "settings.categories"   },
  { href: "/settings/translations", label: "Translations", perm: "settings.translations" },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  const { user } = useAuth();
  const superadmin = isSuperadmin(user);

  // Show a tab if user is superadmin OR has view permission for that section
  const canUsersView        = usePermission("settings.users",        "view");
  const canRolesView        = usePermission("settings.roles",        "view");
  const canCategoriesView   = usePermission("settings.categories",   "view");
  const canTranslationsView = usePermission("settings.translations", "view");

  const permMap: Record<string, boolean> = {
    "settings.users":        superadmin || canUsersView,
    "settings.roles":        superadmin || canRolesView,
    "settings.categories":   superadmin || canCategoriesView,
    "settings.translations": superadmin || canTranslationsView,
  };

  const visibleTabs = TABS.filter((t) => permMap[t.perm]);
  if (visibleTabs.length === 0) return null;

  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
      {visibleTabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
            pathname.startsWith(tab.href)
              ? "bg-white shadow-sm text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
