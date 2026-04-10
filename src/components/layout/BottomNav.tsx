"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Users, QrCode, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

const navItems = [
  { label: "Home", href: "/", icon: LayoutDashboard, permission: null },
  { label: "Trainings", href: "/trainings", icon: BookOpen, permission: "view_trainings" as const },
  { label: "Scan", href: "/scanner", icon: QrCode, permission: "scan_qr" as const },
  { label: "People", href: "/participants", icon: Users, permission: "manage_participants" as const },
  { label: "Reports", href: "/reports", icon: BarChart3, permission: "view_reports" as const },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const visibleItems = navItems.filter(
    (item) => !item.permission || hasPermission(user, item.permission)
  );

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        {visibleItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-xs font-medium transition-colors",
                active ? "text-blue-600" : "text-gray-500"
              )}
            >
              <item.icon
                size={item.href === "/scanner" ? 26 : 22}
                strokeWidth={item.href === "/scanner" ? 2.5 : 1.75}
                className={cn(
                  item.href === "/scanner" && active && "drop-shadow-sm"
                )}
              />
              <span className={item.href === "/scanner" ? "font-semibold" : ""}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
