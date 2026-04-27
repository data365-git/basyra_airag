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
import { useTranslation } from "@/providers/LanguageProvider";
import type { StaffUser, Role } from "@/types";
import toast from "react-hot-toast";

// TODO: filter to chatbot roles (roles where permissions.chatbot is non-empty)

export default function BotAdminsPage() {
  const router = useRouter();
  const canCreate = usePermission("settings.users", "create");
  const canDelete = usePermission("settings.users", "delete");
  const { t } = useTranslation();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [addForm, setAddForm] = useState({ name: "", username: "", password: "", role_id: "" });
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
    setAddForm({ name: "", username: "", password: "", role_id: "" });
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
        title="Bot adminlar"
        subtitle="Chatbot bo'limiga kirish huquqiga ega foydalanuvchilar"
        actions={
          canCreate && (
            <Button size="sm" onClick={openAdd}>
              <Plus size={14} /> {t("settings.users.add")}
            </Button>
          )
        }
      />

      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>{t("common.name")}</Th>
              <Th>Username</Th>
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
                <Td className="text-gray-500">{user.username ?? <span className="text-gray-300">—</span>}</Td>
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
            ))}
          </Tbody>
        </Table>
      )}

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

      {/* Add bot admin modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Bot admin qo'shish"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
            <Button form="add-bot-admin-form" type="submit" loading={adding}>{t("settings.users.create_user")}</Button>
          </>
        }
      >
        <form id="add-bot-admin-form" onSubmit={handleAddUser} className="space-y-4">
          <Input
            label={t("settings.users.full_name")}
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            error={addErrors.name}
            required
          />
          <Input
            label="Username"
            value={addForm.username}
            onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
            error={addErrors.username}
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
