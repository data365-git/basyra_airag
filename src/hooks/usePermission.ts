"use client";

import { useAuth } from "./useAuth";
import { hasPermission } from "@/lib/permissions";
import type { Permission } from "@/types";

export function usePermission(perm: Permission): boolean {
  const { user } = useAuth();
  return hasPermission(user, perm);
}

export function usePermissions(perms: Permission[]): Record<Permission, boolean> {
  const { user } = useAuth();
  return Object.fromEntries(
    perms.map((p) => [p, hasPermission(user, p)])
  ) as Record<Permission, boolean>;
}
