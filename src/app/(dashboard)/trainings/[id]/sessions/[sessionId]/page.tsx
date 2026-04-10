"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { SessionStatusBadge, AttendanceBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { Input } from "@/components/ui/Input";
import { formatDate, formatTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import toast from "react-hot-toast";

export default function SessionDetailPage() {
  const { id: trainingId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const canManage = usePermission("manage_trainings");
  const [session, setSession] = useState<any>(null);
  const [training, setTraining] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editForm, setEditForm] = useState({ status: "", note: "" });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => { if (sessionId) load(); }, [sessionId]);

  async function load() {
    const supabase = createClient();
    const [{ data: s }, { data: t }, { data: att }] = await Promise.all([
      supabase.from("sessions").select("*").eq("id", sessionId).single(),
      supabase.from("trainings").select("name, color").eq("id", trainingId).single(),
      supabase.from("attendance")
        .select("*, participant:participants(id, full_name, phone)")
        .eq("session_id", sessionId),
    ]);

    // Get enrolled participants not yet in attendance
    const { data: enrolled } = await supabase
      .from("training_participants")
      .select("participant:participants(id, full_name, phone)")
      .eq("training_id", trainingId);

    const attendedIds = new Set((att || []).map((r: any) => r.participant_id));
    const pending = (enrolled || [])
      .filter((e: any) => !attendedIds.has(e.participant.id))
      .map((e: any) => ({
        id: `pending-${e.participant.id}`,
        session_id: sessionId,
        participant_id: e.participant.id,
        status: "pending",
        participant: e.participant,
        scanned_at: null,
        note: null,
      }));

    setSession(s);
    setTraining(t);
    setRecords([...(att || []), ...pending].sort((a, b) => a.participant.full_name.localeCompare(b.participant.full_name)));
    setLoading(false);
  }

  function openEdit(record: any) {
    setEditingRecord(record);
    setEditForm({ status: record.status === "pending" ? "present" : record.status, note: record.note || "" });
  }

  async function saveEdit() {
    if (!editingRecord) return;
    setEditLoading(true);
    const supabase = createClient();

    if (editingRecord.status === "pending") {
      await supabase.from("attendance").insert({
        session_id: sessionId,
        participant_id: editingRecord.participant_id,
        status: editForm.status,
        note: editForm.note || null,
      });
    } else {
      await supabase.from("attendance").update({
        status: editForm.status,
        note: editForm.note || null,
        override_at: new Date().toISOString(),
      }).eq("id", editingRecord.id);
    }

    toast.success("Attendance updated");
    setEditingRecord(null);
    setEditLoading(false);
    load();
  }

  const stats = {
    present: records.filter((r) => r.status === "present").length,
    late: records.filter((r) => r.status === "late").length,
    absent: records.filter((r) => r.status === "absent").length,
    excused: records.filter((r) => r.status === "excused").length,
    pending: records.filter((r) => r.status === "pending").length,
  };

  if (loading) return <div className="animate-pulse bg-gray-200 h-64 rounded-xl" />;
  if (!session) return <div className="text-center py-16 text-gray-400">Session not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Session ${session.session_number}`}
        subtitle={`${training?.name} · ${formatDate(session.session_date)} · ${formatTime(session.session_time)}`}
        back
        backHref={`/trainings/${trainingId}`}
        actions={<SessionStatusBadge status={session.status} />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Present", value: stats.present, color: "text-green-600 bg-green-50" },
          { label: "Late", value: stats.late, color: "text-yellow-600 bg-yellow-50" },
          { label: "Excused", value: stats.excused, color: "text-blue-600 bg-blue-50" },
          { label: "Absent", value: stats.absent, color: "text-red-600 bg-red-50" },
          { label: "Pending", value: stats.pending, color: "text-gray-600 bg-gray-50" },
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
              <Th>Participant</Th>
              <Th>Status</Th>
              <Th>Scanned At</Th>
              <Th>Note</Th>
              {canManage && <Th>Actions</Th>}
            </tr>
          </Thead>
          <Tbody>
            {records.length === 0 ? <EmptyRow cols={5} message="No attendance records" /> : records.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.participant?.full_name}</Td>
                <Td><AttendanceBadge status={r.status} /></Td>
                <Td className="text-gray-500 text-xs">
                  {r.scanned_at ? formatDate(r.scanned_at, "h:mm a") : "—"}
                </Td>
                <Td className="text-xs text-gray-500">{r.note || "—"}</Td>
                {canManage && (
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
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
        title="Edit Attendance"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingRecord(null)}>Cancel</Button>
            <Button onClick={saveEdit} loading={editLoading}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 font-medium">{editingRecord?.participant?.full_name}</p>
          <Select
            label="Status"
            value={editForm.status}
            onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
          </Select>
          <Input
            label="Note (optional)"
            value={editForm.note}
            onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Reason for override..."
          />
        </div>
      </Modal>
    </div>
  );
}
