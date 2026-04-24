"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/hooks/useAuth";
import { isSuperadmin } from "@/lib/permissions";
import { useTranslation } from "@/providers/LanguageProvider";

export function SettingsTabs() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslation();
  const superadmin = isSuperadmin(user);

  const canUsersView        = usePermission("settings.users",        "view");
  const canRolesView        = usePermission("settings.roles",        "view");
  const canCategoriesView   = usePermission("settings.categories",   "view");
  const canTranslationsView = usePermission("settings.translations", "view");

  // Profile is always visible to every logged-in user
  const tabs = [
    { href: "/settings/profile",      label: t("settings.tab_profile"),      show: true },
    { href: "/settings/users",        label: t("settings.tab_users"),        show: superadmin || canUsersView },
    { href: "/settings/roles",        label: t("settings.tab_roles"),        show: superadmin || canRolesView },
    { href: "/settings/categories",   label: t("settings.tab_categories"),   show: superadmin || canCategoriesView },
    { href: "/settings/translations", label: t("settings.tab_translations"), show: superadmin || canTranslationsView },
    { href: "/settings/system",       label: t("settings.tab_system"),       show: superadmin },
    { href: "/settings/grading",      label: t("settings.tab_grading"),      show: superadmin },
    { href: "/settings/supervisors",  label: "Nazoratchilar",                show: !!user },
  ];

  const visibleTabs = tabs.filter((tab) => tab.show);

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
