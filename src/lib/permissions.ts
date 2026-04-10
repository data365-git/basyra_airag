import type { Permission, StaffUser } from "@/types";

export function hasPermission(user: StaffUser | null, perm: Permission): boolean {
  if (!user || !user.is_active) return false;
  if (!user.role) return false;
  return user.role.permissions?.[perm] === true;
}

export function requirePermission(user: StaffUser | null, perm: Permission): void {
  if (!hasPermission(user, perm)) {
    throw new Error(`Permission denied: ${perm}`);
  }
}

export const ALL_PERMISSIONS: Permission[] = [
  "view_trainings",
  "manage_trainings",
  "manage_participants",
  "scan_qr",
  "view_reports",
  "manage_users",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_trainings: "View Trainings",
  manage_trainings: "Create & Edit Trainings",
  manage_participants: "Manage Participants",
  scan_qr: "Scan QR Codes",
  view_reports: "View Reports",
  manage_users: "Manage Users & Roles",
};
