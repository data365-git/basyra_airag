"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/Skeleton";
import Link from "next/link";
import type { StaffUser, Role } from "@/types";
import toast from "react-hot-toast";

export default function UsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({ role_id: "", is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/roles").then((r) => r.json()),
    ]).then(([u, r]) => {
      setUsers(u);
      setRoles(r);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Users"
        subtitle="Manage staff accounts and role assignments"
        actions={
          <Link href="/settings/roles">
            <Button variant="outline" size="sm">
              <Shield size={14} /> Manage Roles
            </Button>
          </Link>
        }
      />

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
    </div>
  );
}
