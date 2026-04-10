"use client";

import { useAuth } from "./useAuth";
import { hasPermission, isSuperadmin } from "@/lib/permissions";
import type { PermPage, PermAction } from "@/types";

export function usePermission(page: PermPage, action: PermAction): boolean {
  const { user } = useAuth();
  return hasPermission(user, page, action);
}

export function useIsSuperadmin(): boolean {
  const { user } = useAuth();
  return isSuperadmin(user);
}
