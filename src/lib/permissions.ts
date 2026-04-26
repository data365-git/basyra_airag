import type { StaffUser, PermPage, PermAction, RolePermissions } from "@/types";

/** Returns true if the user's role has the isSuperadmin flag */
export function isSuperadmin(user: StaffUser | null): boolean {
  return !!user?.role?.is_superadmin;
}

/**
 * Check if user has a specific permission.
 * Superadmins always return true.
 *
 * @param user   - The authenticated user
 * @param page   - e.g. "trainings", "settings.users"
 * @param action - e.g. "view", "create", "edit", "delete", "export"
 */
export function hasPermission(
  user: StaffUser | null,
  page: PermPage,
  action: PermAction
): boolean {
  if (!user || !user.is_active) return false;
  if (isSuperadmin(user)) return true;
  if (!user.role) return false;

  const perms = user.role.permissions as RolePermissions | null;
  if (!perms) return false;

  if (page === "settings.users") {
    return (perms.settings?.users as Record<string, boolean>)?.[action] === true;
  }
  if (page === "settings.roles") {
    return (perms.settings?.roles as Record<string, boolean>)?.[action] === true;
  }
  if (page === "settings.categories") {
    return (perms.settings?.categories as Record<string, boolean> | undefined)?.[action] === true;
  }
  if (page === "settings.translations") {
    return (perms.settings?.translations as Record<string, boolean> | undefined)?.[action] === true;
  }
  // Note: optional chaining above is intentional — roles created before these keys were
  // added may lack them in the DB JSON. The type is required but we guard gracefully.

  const bucket = (perms as unknown as Record<string, Record<string, boolean>>)[page];
  return bucket?.[action] === true;
}

/** Check if user has any of the given (page, action) pairs */
export function hasAnyPermission(
  user: StaffUser | null,
  checks: Array<[PermPage, PermAction]>
): boolean {
  return checks.some(([page, action]) => hasPermission(user, page, action));
}

// ─── UI metadata ──────────────────────────────────────────────────────────────

export type PageDef = {
  page: PermPage;
  label: string;
  actions: PermAction[];
  parent?: "settings";
};

export const PAGE_DEFS: PageDef[] = [
  { page: "trainings",              label: "Trainings",     actions: ["view", "create", "edit", "delete"] },
  { page: "participants",           label: "Participants",  actions: ["view", "create", "edit", "delete"] },
  { page: "scanner",                label: "Scanner",       actions: ["view"] },
  { page: "reports",                label: "Reports",       actions: ["view", "export"] },
  { page: "chatbot",                 label: "Chat-bot",      actions: ["view", "conversations", "content", "broadcast", "settings"] as PermAction[] },
  { page: "settings.users",         label: "Users",         actions: ["view", "create", "edit", "delete"], parent: "settings" },
  { page: "settings.roles",         label: "Roles",         actions: ["view", "create", "edit", "delete"], parent: "settings" },
  { page: "settings.categories",    label: "Categories",    actions: ["view", "create", "edit", "delete"], parent: "settings" },
  { page: "settings.translations",  label: "Translations",  actions: ["view", "edit"],                     parent: "settings" },
];

export const PRESET_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#64748b", // slate
];

export function emptyPermissions(): RolePermissions {
  return {
    trainings:    { view: false, create: false, edit: false, delete: false },
    participants: { view: false, create: false, edit: false, delete: false },
    scanner:      { view: false },
    reports:      { view: false, export: false },
    chatbot:      { view: false, conversations: false, content: false, broadcast: false, settings: false },
    settings: {
      users:        { view: false, create: false, edit: false, delete: false },
      roles:        { view: false, create: false, edit: false, delete: false },
      categories:   { view: false, create: false, edit: false, delete: false },
      translations: { view: false, edit: false },
    },
  };
}

export function countAccessiblePages(perms: RolePermissions): number {
  let n = 0;
  if (perms.trainings?.view)              n++;
  if (perms.participants?.view)           n++;
  if (perms.scanner?.view)               n++;
  if (perms.reports?.view)               n++;
  if (perms.chatbot?.view)               n++;
  if (perms.settings?.users?.view)       n++;
  if (perms.settings?.roles?.view)       n++;
  if (perms.settings?.categories?.view)  n++;
  if (perms.settings?.translations?.view) n++;
  return n;
}
