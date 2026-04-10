"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission, isSuperadmin } from "@/lib/permissions";

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (isSuperadmin(user) || hasPermission(user, "settings.users", "view")) {
      router.replace("/settings/users");
    } else if (hasPermission(user, "settings.roles", "view")) {
      router.replace("/settings/roles");
    } else {
      router.replace("/");
    }
  }, [user, router]);

  return null;
}
