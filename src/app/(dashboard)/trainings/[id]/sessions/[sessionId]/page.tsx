"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/Header";
import { SessionStatusBadge, AttendanceBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Select, Input } from "@/components/ui/Input";
import { formatDate, formatTime } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import { CheckSquare, Square, Users, Zap } from "lucide-react";
import toast from "react-hot-toast";

interface SessionTraining {
  id: string;
  name: string;
  color: string;
}

interface SessionDetail {
  id: string;
  session_number: number;
  session_date: string;
  session_time: string;
  status: string;
  training: SessionTraining;
  records: SessionRecord[];
}

interface SessionRecord {
  id: string;
  session_id: string;
  participant_id: string;
  status: string;
  participant: {
    id: string;
    full_name: string;
    phone?: string | null;
  };
  scanned_at: string | null;
  note: string | null;
  override_by_name?: string | null;
  override_at?: string | null;
}

export default function SessionDetailPage() {
  const { id: trainingId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const { t } = useTranslation();
  const canManage = usePermission("trainings", "edit");
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [training, setTraining] = useState<SessionTraining | null>(null);
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRecord, setEditingRecord] = useState<SessionRecord | null>(null);
  const [editForm, setEditForm] = useState({ status: "", note: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchForm, setBatchForm] = useState({ status: "present", note: "" });
  const [batchLoading, setBatchLoading] = useState(false);

  const load = useCallback(async () => {
    const data = await fetch(`/api/sessions/${sessionId}`).then((r) => r.json());
    setSession(data);
    setTraining(data.training);
    setRecords(data.records || []);
    setSelectedIds(new Set());
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    let active = true;

    void (async () => {
      const data = await fetch(`/api/sessions/${sessionId}`).then((r) => r.json());
      if (!active) return;
      setSession(data);
      setTraining(data.training);
      setRecords(data.records || []);
      setSelectedIds(new Set());
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [sessionId]);

  function openEdit(record: SessionRecord) {
    setEditingRecord(record);
    setEditForm({ status: record.status === "pending" ? "present" : record.status, note: record.note || "" });
  }

  async function saveEdit() {
    if (!editingRecord) return;
    setEditLoading(true);

    if (editingRecord.status === "pending") {
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: editingRecord.participant_id,
          status: editForm.status,
          note: editForm.note || null,
        }),
      });
    } else {
      await fetch(`/api/attendance/${editingRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editForm.status,
          note: editForm.note || null,
        }),
      });
    }

    toast.success(t("sessions.attendance_updated"));
    setEditingRecord(null);
    setEditLoading(false);
    load();
  }

  function toggleSelected(participantId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === selectableRecords.length) return new Set();
      return new Set(selectableRecords.map((record) => record.participant_id));
    });
  }

  async function saveBatchEdit() {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);

    const res = await fetch("/api/attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        participant_ids: [...selectedIds],
        status: batchForm.status,
        note: batchForm.note || null,
      }),
    });

    setBatchLoading(false);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.success(
        data.created > 0
          ? `${data.participant_count} ta ishtirokchi yangilandi (${data.created} ta yangi yozuv yaratildi)`
          : `${data.participant_count} ta ishtirokchi yangilandi`
      );
      setSelectedIds(new Set());
      setBatchForm((current) => ({ ...current, note: "" }));
      load();
      return;
    }

    const err = await res.json().catch(() => ({}));
    toast.error(err.error ?? "Batch update failed");
  }

  const selectableRecords = records.filter((record) => record.participant_id);
  const allSelected = selectableRecords.length > 0 && selectedIds.size === selectableRecords.length;

  const stats = {
    present: records.filter((r) => r.status === "present").length,
    late:    records.filter((r) => r.status === "late").length,
    absent:  records.filter((r) => r.status === "absent").length,
    excused: records.filter((r) => r.status === "excused").length,
    pending: records.filter((r) => r.status === "pending").length,
  };

  if (loading) return <div className="animate-pulse bg-gray-200 h-64 rounded-xl" />;
  if (!session) return <div className="text-center py-16 text-gray-400">{t("sessions.not_found")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("trainings.session_number", { n: String(session.session_number) })}
        subtitle={`${training?.name} · ${formatDate(session.session_date)} · ${formatTime(session.session_time)}`}
        back
        backHref={`/trainings/${trainingId}`}
        actions={
          <div className="flex items-center gap-2">
            <SessionStatusBadge status={session.status} />
            <Link href={`/trainings/${trainingId}/sessions/${sessionId}/activity`}>
              <Button size="sm" variant="outline">
                <Zap size={14} /> Faollik
              </Button>
            </Link>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: t("common.status.present"), value: stats.present, color: "text-green-600 bg-green-50" },
          { label: t("common.status.late"),    value: stats.late,    color: "text-yellow-600 bg-yellow-50" },
          { label: t("common.status.excused"), value: stats.excused, color: "text-blue-600 bg-blue-50" },
          { label: t("common.status.absent"),  value: stats.absent,  color: "text-red-600 bg-red-50" },
          { label: t("common.status.pending"), value: stats.pending, color: "text-gray-600 bg-gray-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Attendance list */}
      <Card padding="none">
        {canManage && records.length > 0 && (
          <div className="border-b border-gray-100 px-4 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Users size={16} className="text-blue-500" />
                {selectedIds.size > 0
                  ? `${selectedIds.size} ta ishtirokchi tanlangan`
                  : "Batch yangilash uchun ishtirokchilarni tanlang"}
              </div>
              <button
                onClick={toggleSelectAll}
                className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {allSelected ? "Tanlovni bekor qilish" : "Barchasini tanlash"}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] gap-3 items-end">
              <Select
                label={t("common.status")}
                value={batchForm.status}
                onChange={(e) => setBatchForm((form) => ({ ...form, status: e.target.value }))}
              >
                <option value="present">{t("common.status.present")}</option>
                <option value="late">{t("common.status.late")}</option>
                <option value="absent">{t("common.status.absent")}</option>
                <option value="excused">{t("common.status.excused")}</option>
              </Select>
              <Input
                label={t("sessions.note_label")}
                value={batchForm.note}
                onChange={(e) => setBatchForm((form) => ({ ...form, note: e.target.value }))}
                placeholder="Batch override reason..."
              />
              <Button
                onClick={saveBatchEdit}
                loading={batchLoading}
                disabled={selectedIds.size === 0}
              >
                Batch saqlash
              </Button>
            </div>
          </div>
        )}
        <Table>
          <Thead>
            <tr>
              {canManage && <Th className="w-10">#</Th>}
              <Th>{t("participants.title")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("sessions.scanned_at")}</Th>
              <Th>{t("common.note")}</Th>
              {canManage && <Th>{t("common.actions")}</Th>}
            </tr>
          </Thead>
          <Tbody>
            {records.length === 0
              ? <EmptyRow cols={canManage ? 6 : 5} message={t("sessions.no_records")} />
              : records.map((r) => (
              <Tr key={r.id}>
                {canManage && (
                  <Td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.participant_id)}
                      onChange={() => toggleSelected(r.participant_id)}
                      className="rounded border-gray-300"
                    />
                  </Td>
                )}
                <Td className="font-medium">{r.participant?.full_name}</Td>
                <Td><AttendanceBadge status={r.status} /></Td>
                <Td className="text-gray-500 text-xs">
                  {r.scanned_at
                    ? formatDate(r.scanned_at, "h:mm a")
                    : r.override_at
                    ? formatDate(r.override_at, "h:mm a")
                    : "—"}
                </Td>
                <Td className="text-xs text-gray-500">{r.note || "—"}</Td>
                {canManage && (
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>{t("common.edit")}</Button>
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>

      {/* Edit modal */}
      <Modal
        open={!!editingRecord}
        onClose={() => setEditingRecord(null)}
        title={t("sessions.edit_attendance")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingRecord(null)}>{t("common.cancel")}</Button>
            <Button onClick={saveEdit} loading={editLoading}>{t("common.save")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 font-medium">{editingRecord?.participant?.full_name}</p>
          <Select
            label={t("common.status")}
            value={editForm.status}
            onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="present">{t("common.status.present")}</option>
            <option value="late">{t("common.status.late")}</option>
            <option value="absent">{t("common.status.absent")}</option>
            <option value="excused">{t("common.status.excused")}</option>
          </Select>
          <Input
            label={t("sessions.note_label")}
            value={editForm.note}
            onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Reason for override..."
          />
          {editingRecord?.override_by_name && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              {t("sessions.last_changed_by")}{" "}
              <span className="font-medium text-gray-600">{editingRecord.override_by_name}</span>
              {editingRecord.override_at
                ? ` · ${formatDate(editingRecord.override_at, "MMM d, h:mm a")}`
                : ""}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
