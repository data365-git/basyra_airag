"use client";

import { useState, useEffect } from "react";
import { X, Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PermissionsTable } from "./PermissionsTable";
import { emptyPermissions, PRESET_COLORS } from "@/lib/permissions";
import { useTranslation } from "@/providers/LanguageProvider";
import type { Role, RolePermissions } from "@/types";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Props {
  role?: Role | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RoleModal({ role, onClose, onSaved }: Props) {
  const isEdit = !!role;
  const { t } = useTranslation();

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? PRESET_COLORS[0]);
  const [isSuperadmin, setIsSuperadmin] = useState(role?.is_superadmin ?? false);
  const [permissions, setPermissions] = useState<RolePermissions>(
    (role?.permissions as RolePermissions | undefined) ?? emptyPermissions()
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role) {
      setName(role.name);
      setDescription(role.description ?? "");
      setColor(role.color);
      setIsSuperadmin(role.is_superadmin);
      setPermissions((role.permissions as RolePermissions | undefined) ?? emptyPermissions());
    }
  }, [role]);

  async function handleSave() {
    if (!name.trim()) { toast.error(t("settings.roles.name_required")); return; }
    setSaving(true);

    const payload = { name: name.trim(), description: description.trim() || null, color, is_superadmin: isSuperadmin, permissions };
    const res = await fetch(
      isEdit ? "/api/roles" : "/api/roles",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: role!.id, ...payload } : payload),
      }
    );

    setSaving(false);
    if (res.ok) {
      toast.success(isEdit ? t("settings.roles.updated") : t("settings.roles.created"));
      onSaved();
      onClose();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("trainings.save_failed"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? t("settings.roles.edit_title", { name: role!.name }) : t("settings.roles.new")}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("settings.roles.name_label")} *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trainer, Coordinator" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("common.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What can this role do?"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t("common.color")}</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all",
                    color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Superadmin toggle */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <Shield size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-900">{t("settings.roles.superadmin_label")}</span>
                <button
                  role="switch"
                  aria-checked={isSuperadmin}
                  onClick={() => setIsSuperadmin((v) => !v)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    isSuperadmin ? "bg-amber-500" : "bg-gray-200"
                  )}
                >
                  <span className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                    isSuperadmin ? "translate-x-4" : "translate-x-1"
                  )} />
                </button>
              </div>
              <p className="text-xs text-amber-700 mt-1">
                {t("settings.roles.superadmin_hint")}
              </p>
            </div>
          </div>

          {/* Permissions table */}
          {!isSuperadmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.roles.permissions")}</label>
              <PermissionsTable permissions={permissions} onChange={setPermissions} />
            </div>
          )}

          {isSuperadmin && (
            <p className="text-sm text-amber-700 bg-amber-50 px-4 py-3 rounded-lg">
              {t("settings.roles.superadmin_note")}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} loading={saving}>
            {isEdit ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}
