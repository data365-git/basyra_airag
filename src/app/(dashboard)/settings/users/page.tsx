"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { usePermission } from "@/hooks/usePermission";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { useTranslation } from "@/providers/LanguageProvider";
import type { StaffUser, Role } from "@/types";
import toast from "react-hot-toast";

export default function UsersPage() {
  const router = useRouter();
  const canCreate = usePermission("settings.users", "create");
  const canDelete = usePermission("settings.users", "delete");
  const { t } = useTranslation();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({ role_id: "", is_active: true });
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deletingUser, setDeletingUser] = useState<StaffUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function deleteUser() {
    if (!deletingUser) return;
    setDeleteLoading(true);
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deletingUser.id }),
    });
    setDeleteLoading(false);
    if (res.ok) {
      toast.success(t("settings.users.deleted"));
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      setDeletingUser(null);
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("settings.users.delete_failed"));
      setDeletingUser(null);
    }
  }

  // Add user modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role_id: "" });
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/roles").then((r) => r.json()),
    ]).then(([u, r]) => {
      setUsers(Array.isArray(u) ? u : []);
      setRoles(Array.isArray(r) ? r : []);
      setLoading(false);
    });
  }, []);

  function openEdit(user: StaffUser) {
    setEditingUser(user);
    setEditForm({ role_id: user.role_id || "", is_active: user.is_active });
  }

  async function saveUser() {
    if (!editingUser) return;
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingUser.id, ...editForm, role_id: editForm.role_id || null }),
    });
    if (res.ok) {
      toast.success(t("settings.users.updated"));
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      setEditingUser(null);
      router.refresh();
    } else {
      toast.error(t("settings.users.update_failed"));
    }
    setSaving(false);
  }

  function openAdd() {
    setAddForm({ name: "", email: "", password: "", role_id: "" });
    setAddErrors({});
    setAddOpen(true);
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddErrors({});
    setAdding(true);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, role_id: addForm.role_id || null }),
    });

    setAdding(false);

    if (res.ok) {
      const newUser = await res.json();
      setUsers((prev) => [...prev, newUser].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(t("settings.users.created"));
      setAddOpen(false);
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.fields) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) {
          flat[k] = Array.isArray(v) ? v[0] : String(v);
        }
        setAddErrors(flat);
      } else {
        toast.error(err.error ?? t("settings.users.create_failed"));
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.settings")}
        subtitle={t("settings.users.subtitle")}
        actions={
          canCreate && (
            <Button size="sm" onClick={openAdd}>
              <Plus size={14} /> {t("settings.users.add")}
            </Button>
          )
        }
      />

      <SettingsTabs />

      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("common.email")}</Th>
              <Th>{t("settings.users.role_label")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </Thead>
          <Tbody>
            {users.length === 0 ? <EmptyRow cols={5} message={t("settings.users.no_users")} /> : users.map((user) => (
              <Tr key={user.id}>
                <Td className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-semibold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    {user.name}
                  </div>
                </Td>
                <Td className="text-gray-500">{user.email}</Td>
                <Td>
                  {user.role ? (
                    <Badge variant="blue">{user.role.name}</Badge>
                  ) : (
                    <span className="text-xs text-gray-400">{t("settings.users.no_role")}</span>
                  )}
                </Td>
                <Td>
                  <Badge variant={user.is_active ? "green" : "gray"}>
                    {user.is_active ? t("settings.users.active_label") : t("settings.users.inactive")}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(user)}>
                      {t("common.edit")}
                    </Button>
                    {canDelete && (
                      <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeletingUser(user)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* Edit user modal */}
      <Modal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={t("settings.users.edit_title")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingUser(null)}>{t("common.cancel")}</Button>
            <Button onClick={saveUser} loading={saving}>{t("common.save")}</Button>
          </>
        }
      >
        {editingUser && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{editingUser.name}</p>
              <p className="text-xs text-gray-500">{editingUser.email}</p>
            </div>
            <Select
              label={t("settings.users.role_label")}
              value={editForm.role_id}
              onChange={(e) => setEditForm((f) => ({ ...f, role_id: e.target.value }))}
            >
              <option value="">{t("settings.users.no_role_option")}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-sm font-medium text-gray-900">{t("settings.users.active_account")}</span>
            </label>
          </div>
        )}
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        title={t("settings.users.delete_title")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeletingUser(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={deleteUser} loading={deleteLoading}>{t("common.delete")}</Button>
          </>
        }
      >
        {deletingUser && (
          <p className="text-sm text-gray-600">
            {t("settings.users.delete_confirm", { name: deletingUser.name })}
          </p>
        )}
      </Modal>

      {/* Add user modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("settings.users.add_title")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
            <Button form="add-user-form" type="submit" loading={adding}>{t("settings.users.create_user")}</Button>
          </>
        }
      >
        <form id="add-user-form" onSubmit={handleAddUser} className="space-y-4">
          <Input
            label={t("settings.users.full_name")}
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            error={addErrors.name}
            required
          />
          <Input
            label={t("common.email")}
            type="email"
            value={addForm.email}
            onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
            error={addErrors.email}
            required
          />
          <Input
            label={t("settings.users.password_label")}
            type="password"
            value={addForm.password}
            onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
            error={addErrors.password}
            hint={t("settings.users.password_hint")}
            required
          />
          <Select
            label={t("settings.users.role_label")}
            value={addForm.role_id}
            onChange={(e) => setAddForm((f) => ({ ...f, role_id: e.target.value }))}
          >
            <option value="">{t("settings.users.no_role_option")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </form>
      </Modal>
    </div>
  );
}
