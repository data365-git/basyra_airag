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

  const [deletingUser, setDeletingUser] = useState<StaffUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    phone: "",
    role_id: "",
    username: "",
    password: "",
    email: "",
  });
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

  function openAdd() {
    setAddForm({ name: "", phone: "", role_id: "", username: "", password: "", email: "" });
    setAddErrors({});
    setAddOpen(true);
  }

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

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddErrors({});

    const trimmedForm = {
      name: addForm.name.trim(),
      phone: addForm.phone.trim(),
      role_id: addForm.role_id,
      username: addForm.username.trim(),
      password: addForm.password,
      email: addForm.email.trim(),
    };
    const errors: Record<string, string> = {};

    if (!trimmedForm.name) errors.name = t("settings.users.name_required");
    if (!trimmedForm.phone) errors.phone = t("settings.users.phone_required");
    if (!trimmedForm.role_id) errors.role_id = t("settings.users.role_required");
    if (trimmedForm.username && trimmedForm.password.length < 6) {
      errors.password = t("settings.users.password_required_when_username");
    }
    if (!trimmedForm.username && trimmedForm.password) {
      errors.username = t("settings.users.username_required_when_password");
    }

    if (Object.keys(errors).length > 0) {
      setAddErrors(errors);
      return;
    }

    setAdding(true);

    const payload = {
      name: trimmedForm.name,
      phone: trimmedForm.phone,
      role_id: trimmedForm.role_id,
      username: trimmedForm.username || null,
      password: trimmedForm.username ? trimmedForm.password : undefined,
      email: trimmedForm.email || null,
    };

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
        title={t("settings.users.title")}
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
        <TableSkeleton rows={5} cols={6} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>{t("common.phone")}</Th>
              <Th>{t("settings.users.username_label")}</Th>
              <Th>{t("settings.users.role_label")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </Thead>
          <Tbody>
            {users.length === 0 ? (
              <EmptyRow cols={6} message={t("settings.users.no_users")} />
            ) : (
              users.map((user) => (
                <Tr key={user.id}>
                  <Td className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span>{user.name}</span>
                    </div>
                  </Td>
                  <Td className="text-gray-500">{user.phone ?? <span className="text-gray-300">-</span>}</Td>
                  <Td className="text-gray-500">{user.username ?? <span className="text-gray-300">-</span>}</Td>
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
                    {canDelete && (
                      <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeletingUser(user)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      )}

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
            label={t("common.phone")}
            type="tel"
            value={addForm.phone}
            onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
            error={addErrors.phone}
            required
          />
          <Select
            label={t("settings.users.role_label")}
            value={addForm.role_id}
            onChange={(e) => setAddForm((f) => ({ ...f, role_id: e.target.value }))}
            error={addErrors.role_id}
            required
          >
            <option value="">{t("settings.users.select_role")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          <Input
            label={`${t("settings.users.username_label")} (${t("common.optional")})`}
            value={addForm.username}
            onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
            error={addErrors.username}
          />
          <Input
            label={t("settings.users.password_label")}
            type="password"
            value={addForm.password}
            onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
            error={addErrors.password}
            hint={addForm.username.trim() ? t("settings.users.password_hint") : t("settings.users.password_optional_hint")}
            required={addForm.username.trim().length > 0}
          />
          <Input
            label={`${t("common.email")} (${t("common.optional")})`}
            type="email"
            value={addForm.email}
            onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
            error={addErrors.email}
          />
        </form>
      </Modal>
    </div>
  );
}
