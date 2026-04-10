"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { usePermission } from "@/hooks/usePermission";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import type { StaffUser, Role } from "@/types";
import toast from "react-hot-toast";

export default function UsersPage() {
  const canCreate = usePermission("settings.users", "create");
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({ role_id: "", is_active: true });
  const [saving, setSaving] = useState(false);

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
      toast.success("User updated");
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      setEditingUser(null);
    } else {
      toast.error("Failed to update");
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
      toast.success("User created");
      setAddOpen(false);
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.fields) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) {
          flat[k] = Array.isArray(v) ? v[0] : String(v);
        }
        setAddErrors(flat);
      } else {
        toast.error(err.error ?? "Failed to create user");
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage staff accounts and permissions"
        actions={
          canCreate && (
            <Button size="sm" onClick={openAdd}>
              <Plus size={14} /> Add User
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
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {users.length === 0 ? <EmptyRow cols={5} message="No staff users" /> : users.map((user) => (
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
                    <span className="text-xs text-gray-400">No role</span>
                  )}
                </Td>
                <Td>
                  <Badge variant={user.is_active ? "green" : "gray"}>
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(user)}>
                    Edit
                  </Button>
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
        title="Edit Staff User"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={saveUser} loading={saving}>Save</Button>
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
              label="Role"
              value={editForm.role_id}
              onChange={(e) => setEditForm((f) => ({ ...f, role_id: e.target.value }))}
            >
              <option value="">No role (no permissions)</option>
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
              <span className="text-sm font-medium text-gray-900">Active account</span>
            </label>
          </div>
        )}
      </Modal>

      {/* Add user modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Staff User"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-user-form" type="submit" loading={adding}>Create User</Button>
          </>
        }
      >
        <form id="add-user-form" onSubmit={handleAddUser} className="space-y-4">
          <Input
            label="Full Name"
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            error={addErrors.name}
            required
          />
          <Input
            label="Email"
            type="email"
            value={addForm.email}
            onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
            error={addErrors.email}
            required
          />
          <Input
            label="Password"
            type="password"
            value={addForm.password}
            onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
            error={addErrors.password}
            hint="Minimum 6 characters"
            required
          />
          <Select
            label="Role"
            value={addForm.role_id}
            onChange={(e) => setAddForm((f) => ({ ...f, role_id: e.target.value }))}
          >
            <option value="">No role (no permissions)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </form>
      </Modal>
    </div>
  );
}
