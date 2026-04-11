"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
import toast from "react-hot-toast";

export default function SessionDetailPage() {
  const { id: trainingId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const { t } = useTranslation();
  const canManage = usePermission("trainings", "edit");
  const [session, setSession] = useState<any>(null);
  const [training, setTraining] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editForm, setEditForm] = useState({ status: "", note: "" });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => { if (sessionId) load(); }, [sessionId]);

  async function load() {
    const data = await fetch(`/api/sessions/${sessionId}`).then((r) => r.json());
    setSession(data);
    setTraining(data.training);
    setRecords(data.records || []);
    setLoading(false);
  }

  function openEdit(record: any) {
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
        title={t("trainings.session_number", { n: session.session_number })}
        subtitle={`${training?.name} · ${formatDate(session.session_date)} · ${formatTime(session.session_time)}`}
        back
        backHref={`/trainings/${trainingId}`}
        actions={<SessionStatusBadge status={session.status} />}
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
        <Table>
          <Thead>
            <tr>
              <Th>{t("participants.title")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("sessions.scanned_at")}</Th>
              <Th>{t("common.note")}</Th>
              {canManage && <Th>{t("common.actions")}</Th>}
            </tr>
          </Thead>
          <Tbody>
            {records.length === 0
              ? <EmptyRow cols={5} message={t("sessions.no_records")} />
              : records.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.participant?.full_name}</Td>
                <Td><AttendanceBadge status={r.status} /></Td>
                <Td className="text-gray-500 text-xs">
                  {r.scanned_at ? formatDate(r.scanned_at, "h:mm a") : "—"}
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
