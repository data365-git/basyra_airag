"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/Modal";
import { ALL_PERMISSIONS, PERMISSION_LABELS } from "@/lib/permissions";
import { usePermission } from "@/hooks/usePermission";
import type { Role, Permission } from "@/types";
import toast from "react-hot-toast";

export default function RolesPage() {
  const canManage = usePermission("manage_users");
  const [roles, setRoles] = useState<Role[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editedRoles, setEditedRoles] = useState<Record<string, Role>>({});

  useEffect(() => { loadRoles(); }, []);

  async function loadRoles() {
    const res = await fetch("/api/roles");
    const data = await res.json();
    setRoles(data);
  }

  async function createRole() {
    if (!newRoleName.trim()) return;
    setCreating(true);
    const permissions = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, false])) as Record<Permission, boolean>;
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newRoleName.trim(), permissions }),
    });
    if (res.ok) {
      toast.success("Role created");
      setNewRoleName("");
      loadRoles();
    }
    setCreating(false);
  }

  function togglePermission(roleId: string, perm: Permission) {
    const base = editedRoles[roleId] || roles.find((r) => r.id === roleId)!;
    const updated = {
      ...base,
      permissions: { ...base.permissions, [perm]: !base.permissions[perm] },
    };
    setEditedRoles((prev) => ({ ...prev, [roleId]: updated }));
  }

  async function saveRole(roleId: string) {
    const role = editedRoles[roleId];
    if (!role) return;
    setSaving(roleId);
    await fetch("/api/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: roleId, name: role.name, permissions: role.permissions }),
    });
    toast.success("Role saved");
    setSaving(null);
    setEditedRoles((prev) => { const n = { ...prev }; delete n[roleId]; return n; });
    loadRoles();
  }

  async function deleteRole() {
    if (!deletingId) return;
    await fetch(`/api/roles?id=${deletingId}`, { method: "DELETE" });
    toast.success("Role deleted");
    setDeletingId(null);
    loadRoles();
  }

  const getRole = (id: string) => editedRoles[id] || roles.find((r) => r.id === id)!;

  return (
    <div className="space-y-6">
      <PageHeader title="Roles & Permissions" subtitle="Define what each role can do" />

      {canManage && (
        <Card>
          <CardTitle className="mb-3">Create New Role</CardTitle>
          <div className="flex gap-3">
            <Input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="e.g. Trainer, Viewer, Scanner..."
              onKeyDown={(e) => e.key === "Enter" && createRole()}
            />
            <Button onClick={createRole} loading={creating}>
              <Plus size={16} /> Create
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {roles.map((role) => {
          const current = getRole(role.id);
          const hasChanges = !!editedRoles[role.id];

          return (
            <Card key={role.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 bg-blue-500 rounded-sm" />
                  <CardTitle>{current.name}</CardTitle>
                </div>
                <div className="flex gap-2">
                  {hasChanges && (
                    <Button size="sm" onClick={() => saveRole(role.id)} loading={saving === role.id}>
                      <Save size={14} /> Save
                    </Button>
                  )}
                  {canManage && (
                    <Button size="sm" variant="danger" onClick={() => setDeletingId(role.id)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </CardHeader>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ALL_PERMISSIONS.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={current.permissions?.[perm] ?? false}
                      onChange={() => canManage && togglePermission(role.id, perm)}
                      disabled={!canManage}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{PERMISSION_LABELS[perm]}</div>
                      <div className="text-xs text-gray-500 capitalize">{perm.replace(/_/g, " ")}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <ConfirmModal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={deleteRole}
        danger
        title="Delete Role"
        message="This will remove the role. Users assigned this role will lose all permissions."
        confirmLabel="Delete"
      />
    </div>
  );
}
