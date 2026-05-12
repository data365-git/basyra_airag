"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PermissionsTable } from "./PermissionsTable";
import { countAccessiblePages } from "@/lib/permissions";
import { useTranslation } from "@/providers/LanguageProvider";
import type { Role, RolePermissions } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  role: Role;
  canManage: boolean;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

const TOTAL_PAGES = 6;

export function RoleRow({ role, canManage, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  const perms = role.permissions as RolePermissions | undefined;
  const accessCount = role.is_superadmin ? TOTAL_PAGES : (perms ? countAccessiblePages(perms) : 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Color dot */}
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{role.name}</span>
            {role.is_superadmin && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <ShieldCheck size={11} /> {t("settings.roles.superadmin_label")}
              </span>
            )}
          </div>
          {role.description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{role.description}</p>
          )}
        </div>

        {/* Page count badge */}
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">
          {t("settings.roles.pages_count", { accessible: String(accessCount), total: String(TOTAL_PAGES) })}
        </span>

        {/* User count */}
        {role.user_count !== undefined && (
          <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
            {t("settings.roles.users_count", { n: String(role.user_count) })}
          </span>
        )}

        {/* Actions */}
        {canManage && (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" onClick={() => onEdit(role)}>
              <Pencil size={13} />
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => onDelete(role)}
              disabled={(role.user_count ?? 0) > 0}
              title={(role.user_count ?? 0) > 0 ? t("settings.roles.cannot_delete") : t("settings.roles.delete_role")}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        )}

        {/* Expand chevron */}
        <div className={cn("text-gray-400 transition-transform", expanded && "rotate-180")}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      {/* Expanded permission summary */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4">
          {role.is_superadmin ? (
            <p className="text-sm text-amber-700 bg-amber-50 px-4 py-3 rounded-lg">
              {t("settings.roles.superadmin_full_access")}
            </p>
          ) : perms ? (
            <PermissionsTable permissions={perms} readOnly />
          ) : (
            <p className="text-sm text-gray-400">{t("settings.roles.no_permissions")}</p>
          )}
        </div>
      )}
    </div>
  );
}
