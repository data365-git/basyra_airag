"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import { RoleRow } from "@/components/roles/RoleRow";
import { RoleModal } from "@/components/roles/RoleModal";
import { usePermission } from "@/hooks/usePermission";
import { usePathname } from "next/navigation";
import type { Role } from "@/types";
import toast from "react-hot-toast";

export default function RolesPage() {
  const canCreate = usePermission("settings.roles", "create");
  const canManage = usePermission("settings.roles", "edit");
  const pathname = usePathname();

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalRole, setModalRole] = useState<Role | null | "new">(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadRoles(); }, []);

  async function loadRoles() {
    setLoading(true);
    const res = await fetch("/api/roles");
    const data = await res.json();
    setRoles(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function handleDelete() {
    if (!deletingRole) return;
    setDeleting(true);
    const res = await fetch(`/api/roles/${deletingRole.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast.success("Role deleted");
      setDeletingRole(null);
      loadRoles();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle={`${roles.length} roles defined`}
        actions={
          canCreate ? (
            <Button onClick={() => setModalRole("new")}>
              <Plus size={16} /> New Role
            </Button>
          ) : undefined
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <Link
          href="/settings/users"
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            pathname.startsWith("/settings/users")
              ? "bg-white shadow-sm text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Users
        </Link>
        <Link
          href="/settings/roles"
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            pathname.startsWith("/settings/roles")
              ? "bg-white shadow-sm text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Roles
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No roles yet.</div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              canManage={canManage}
              onEdit={(r) => setModalRole(r)}
              onDelete={(r) => setDeletingRole(r)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {modalRole !== null && (
        <RoleModal
          role={modalRole === "new" ? null : modalRole}
          onClose={() => setModalRole(null)}
          onSaved={loadRoles}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!deletingRole}
        onClose={() => setDeletingRole(null)}
        onConfirm={handleDelete}
        danger
        title="Delete Role"
        message={
          deletingRole
            ? `Delete "${deletingRole.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
      />
    </div>
  );
}
