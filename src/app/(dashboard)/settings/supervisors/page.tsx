"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Plus, Link2, Trash2, ChevronDown, ChevronRight, Copy, Check, X } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { useAuth } from "@/hooks/useAuth";
import { isSuperadmin } from "@/lib/permissions";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Supervisor {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
  assignment_count: number;
}

interface Assignment {
  id: string;
  participant_id: string;
  training_id: string | null;
  created_at: string;
  // resolved client-side
  participant_name?: string;
}

interface ParticipantResult {
  id: string;
  full_name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "Hech qachon";
  return new Date(iso).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Expandable assignments panel ──────────────────────────────────────────────

function AssignmentsPanel({
  supervisor,
  canManage,
  onAssignmentChange,
}: {
  supervisor: Supervisor;
  canManage: boolean;
  onAssignmentChange: () => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ParticipantResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch assignments + resolve participant names
  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supervisors/${supervisor.id}/assignments`);
      if (!res.ok) throw new Error();
      const raw: Assignment[] = await res.json();

      // Resolve participant names
      const enriched = await Promise.all(
        raw.map(async (a) => {
          try {
            const pr = await fetch(`/api/participants/${a.participant_id}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null);
            return { ...a, participant_name: pr?.full_name ?? a.participant_id };
          } catch {
            return { ...a, participant_name: a.participant_id };
          }
        })
      );
      setAssignments(enriched);
    } catch {
      toast.error("Topshiriqlarni yuklashda xato");
    } finally {
      setLoading(false);
    }
  }, [supervisor.id]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // Participant search with debounce
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/participants?search=${encodeURIComponent(search.trim())}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data.slice(0, 10) : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [search]);

  async function addAssignment(participant: ParticipantResult) {
    setAdding(true);
    try {
      const res = await fetch(`/api/supervisors/${supervisor.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: participant.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Topshiriq qo'shishda xato");
        return;
      }
      setSearch("");
      setResults([]);
      await loadAssignments();
      onAssignmentChange();
    } finally {
      setAdding(false);
    }
  }

  async function removeAssignment(assignment: Assignment) {
    try {
      const res = await fetch(`/api/supervisors/${supervisor.id}/assignments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: assignment.participant_id, trainingId: assignment.training_id }),
      });
      if (!res.ok) {
        toast.error("Topshiriqni o'chirishda xato");
        return;
      }
      setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
      onAssignmentChange();
    } catch {
      toast.error("Topshiriqni o'chirishda xato");
    }
  }

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-4 py-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Topshiriqlar</p>

      {loading ? (
        <div className="h-16 bg-gray-100 animate-pulse rounded-lg" />
      ) : assignments.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Hali topshiriq yo'q</p>
      ) : (
        <div className="space-y-1">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
              <span className="text-gray-800">{a.participant_name ?? a.participant_id}</span>
              {canManage && (
                <button
                  onClick={() => removeAssignment(a)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="O'chirish"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="relative">
          <Input
            placeholder="Ishtirokchi qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(results.length > 0 || searching) && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {searching ? (
                <div className="px-3 py-2 text-sm text-gray-400">Qidirilmoqda...</div>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    disabled={adding}
                    onClick={() => addAssignment(p)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 transition-colors"
                  >
                    {p.full_name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
      title="Nusxa olish"
    >
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
      {copied ? "Nusxalandi" : "Nusxalash"}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupervisorsPage() {
  const { user } = useAuth();
  const canManage = isSuperadmin(user);

  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "" });
  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Inline invite modal
  const [inlineInvite, setInlineInvite] = useState<{ supervisorName: string; url: string } | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function loadSupervisors() {
    try {
      const res = await fetch("/api/supervisors");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSupervisors(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Nazoratchilarni yuklashda xato");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSupervisors();
  }, []);

  // ── Create supervisor ──────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/supervisors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createForm.name.trim(), email: createForm.email.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Yaratishda xato");
        return;
      }
      const data = await res.json();
      setInviteUrl(data.invite_url);
      await loadSupervisors();
    } finally {
      setCreating(false);
    }
  }

  function closeCreateModal() {
    setCreateOpen(false);
    setInviteUrl(null);
    setCreateForm({ name: "", email: "" });
  }

  // ── Generate invite link ───────────────────────────────────────────────────

  async function generateInvite(supervisor: Supervisor) {
    setInviting(supervisor.id);
    try {
      const res = await fetch(`/api/supervisors/${supervisor.id}/invite`, { method: "POST" });
      if (!res.ok) {
        toast.error("Taklif havolasini yaratishda xato");
        return;
      }
      const data = await res.json();
      setInlineInvite({ supervisorName: supervisor.name, url: data.invite_url });
    } finally {
      setInviting(null);
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  async function toggleActive(supervisor: Supervisor) {
    try {
      const res = await fetch(`/api/supervisors/${supervisor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !supervisor.is_active }),
      });
      if (!res.ok) {
        toast.error("Holatni o'zgartirishda xato");
        return;
      }
      setSupervisors((prev) =>
        prev.map((s) => (s.id === supervisor.id ? { ...s, is_active: !supervisor.is_active } : s))
      );
    } catch {
      toast.error("Holatni o'zgartirishda xato");
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/supervisors/${deletingId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "O'chirishda xato");
        return;
      }
      setSupervisors((prev) => prev.filter((s) => s.id !== deletingId));
      if (expandedId === deletingId) setExpandedId(null);
      setDeletingId(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  const deletingName = supervisors.find((s) => s.id === deletingId)?.name ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sozlamalar"
        subtitle="Nazoratchilarni boshqarish"
        actions={
          canManage && (
            <Button size="sm" onClick={() => { setCreateForm({ name: "", email: "" }); setInviteUrl(null); setCreateOpen(true); }}>
              <Plus size={14} /> Nazoratchini qo'shish
            </Button>
          )
        }
      />

      <SettingsTabs />

      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Ism / Email</Th>
              <Th>Holat</Th>
              <Th>So'nggi kirish</Th>
              <Th>Topshiriqlar</Th>
              <Th>Amallar</Th>
            </tr>
          </Thead>
          <Tbody>
            {supervisors.length === 0 ? (
              <EmptyRow cols={5} message="Nazoratchilar mavjud emas" />
            ) : (
              supervisors.map((supervisor) => (
                <>
                  <Tr key={supervisor.id}>
                    <Td>
                      <button
                        className="text-left"
                        onClick={() => setExpandedId(expandedId === supervisor.id ? null : supervisor.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          {expandedId === supervisor.id ? (
                            <ChevronDown size={14} className="text-gray-400 shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="text-gray-400 shrink-0" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{supervisor.name}</p>
                            <p className="text-xs text-gray-500">{supervisor.email}</p>
                          </div>
                        </div>
                      </button>
                    </Td>
                    <Td>
                      <Badge variant={supervisor.is_active ? "green" : "gray"}>
                        {supervisor.is_active ? "Faol" : "Nofaol"}
                      </Badge>
                    </Td>
                    <Td className="text-sm text-gray-500">{formatDate(supervisor.last_login_at)}</Td>
                    <Td className="text-sm text-gray-600">{supervisor.assignment_count}</Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={inviting === supervisor.id}
                              onClick={() => generateInvite(supervisor)}
                              title="Taklif havolasi"
                            >
                              <Link2 size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleActive(supervisor)}
                              title={supervisor.is_active ? "Nofaol qilish" : "Faollashtirish"}
                            >
                              {supervisor.is_active ? "Bloklash" : "Faollashtirish"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => setDeletingId(supervisor.id)}
                              title="O'chirish"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                  {expandedId === supervisor.id && (
                    <tr key={`${supervisor.id}-assignments`}>
                      <td colSpan={5} className="p-0">
                        <AssignmentsPanel
                          supervisor={supervisor}
                          canManage={canManage}
                          onAssignmentChange={() =>
                            setSupervisors((prev) =>
                              prev.map((s) =>
                                s.id === supervisor.id
                                  ? { ...s, assignment_count: s.assignment_count }
                                  : s
                              )
                            )
                          }
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </Tbody>
        </Table>
      )}

      {/* Create supervisor modal */}
      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title="Nazoratchini qo'shish"
        size="sm"
        footer={
          inviteUrl ? (
            <Button onClick={closeCreateModal}>Yopish</Button>
          ) : (
            <>
              <Button variant="outline" onClick={closeCreateModal}>Bekor qilish</Button>
              <Button form="create-supervisor-form" type="submit" loading={creating}>
                Qo'shish
              </Button>
            </>
          )
        }
      >
        {inviteUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Nazoratchiga ushbu havolani yuboring — u 7 kun ichida amal qiladi.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 break-all font-mono">
              {inviteUrl}
            </div>
            <CopyButton text={inviteUrl} />
          </div>
        ) : (
          <form id="create-supervisor-form" onSubmit={handleCreate} className="space-y-4">
            <Input
              label="Ism"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </form>
        )}
      </Modal>

      {/* Inline invite URL modal */}
      <Modal
        open={!!inlineInvite}
        onClose={() => setInlineInvite(null)}
        title="Taklif havolasi"
        size="sm"
        footer={<Button onClick={() => setInlineInvite(null)}>Yopish</Button>}
      >
        {inlineInvite && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              <strong>{inlineInvite.supervisorName}</strong> uchun yangi havola yaratildi. U 7 kun ichida amal qiladi.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 break-all font-mono">
              {inlineInvite.url}
            </div>
            <CopyButton text={inlineInvite.url} />
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Nazoratchi o'chirilsinmi?"
        message={`"${deletingName}" nazoratchi o'chiriladi. Bu amalni qaytarib bo'lmaydi.`}
        confirmLabel="O'chirish"
        loading={deleteLoading}
        danger
      />
    </div>
  );
}
