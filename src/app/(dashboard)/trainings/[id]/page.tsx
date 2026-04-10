"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Edit, Download, Users, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { TrainingStatusBadge, SessionStatusBadge, AttendanceBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ConfirmModal } from "@/components/ui/Modal";
import { formatDate, formatTime, getAttendanceColorClass, DAYS_OF_WEEK } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import toast from "react-hot-toast";

export default function TrainingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const canManage = usePermission("manage_trainings");
  const canManageParticipants = usePermission("manage_participants");
  const [training, setTraining] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const supabase = createClient();
    const [{ data: t }, { data: s }, { data: p }] = await Promise.all([
      supabase.from("trainings").select("*").eq("id", id).single(),
      supabase.from("sessions").select("*").eq("training_id", id).order("session_number"),
      supabase.from("participants")
        .select("*, training_participants!inner(training_id)")
        .eq("training_participants.training_id", id)
        .order("full_name"),
    ]);

    setTraining(t);
    setSessions(s || []);
    setParticipants(p || []);

    // Get attendance for all sessions
    if (s?.length) {
      const sessionIds = s.map((ses: any) => ses.id);
      const { data: att } = await supabase
        .from("attendance")
        .select("*")
        .in("session_id", sessionIds);
      setAttendance(att || []);
    }

    setLoading(false);
  }

  function getParticipantRate(participantId: string) {
    const closedSessions = sessions.filter((s) => s.status === "closed");
    if (!closedSessions.length) return null;
    const records = attendance.filter((a) => a.participant_id === participantId && closedSessions.some((s) => s.id === a.session_id));
    const present = records.filter((r) => r.status === "present" || r.status === "late").length;
    return Math.round((present / closedSessions.length) * 100);
  }

  function getSessionStats(sessionId: string) {
    const recs = attendance.filter((a) => a.session_id === sessionId);
    return {
      present: recs.filter((r) => r.status === "present").length,
      late: recs.filter((r) => r.status === "late").length,
      absent: recs.filter((r) => r.status === "absent").length,
      total: participants.length,
    };
  }

  async function openSession(sessionId: string) {
    await fetch(`/api/sessions/${sessionId}/open`, { method: "POST" });
    toast.success("Session opened");
    load();
  }

  async function closeSession(sessionId: string) {
    await fetch(`/api/sessions/${sessionId}/close`, { method: "POST" });
    toast.success("Session closed");
    load();
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/trainings/${id}`, { method: "DELETE" });
    toast.success("Training deleted");
    router.push("/trainings");
  }

  if (loading) return <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div>;
  if (!training) return <div className="text-center py-16 text-gray-400">Training not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={training.name}
        subtitle={`Every ${DAYS_OF_WEEK[training.schedule_day]} · ${formatTime(training.schedule_time)}`}
        back
        backHref="/trainings"
        actions={
          <>
            {canManage && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/api/export/attendance?training_id=${id}`, "_blank")}
                >
                  <Download size={14} /> Export
                </Button>
                <Link href={`/trainings/${id}/edit`}>
                  <Button variant="outline" size="sm"><Edit size={14} /> Edit</Button>
                </Link>
                <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={14} />
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Info card */}
      <Card>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <TrainingStatusBadge status={training.status} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Duration</p>
            <p className="text-sm font-medium">{formatDate(training.start_date)} — {formatDate(training.end_date)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Participants</p>
            <p className="text-sm font-medium">{participants.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Sessions</p>
            <p className="text-sm font-medium">{sessions.length} total</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Alert Threshold</p>
            <p className="text-sm font-medium">{training.attendance_threshold}%</p>
          </div>
        </div>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Sessions ({sessions.length})</CardTitle>
        </CardHeader>
        <Table>
          <Thead>
            <tr>
              <Th>#</Th>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th>Present</Th>
              <Th>Absent</Th>
              <Th></Th>
            </tr>
          </Thead>
          <Tbody>
            {sessions.length === 0 ? <EmptyRow cols={6} message="No sessions" /> : sessions.map((s) => {
              const stats = getSessionStats(s.id);
              return (
                <Tr key={s.id}>
                  <Td className="font-medium">Session {s.session_number}</Td>
                  <Td>{formatDate(s.session_date)}</Td>
                  <Td><SessionStatusBadge status={s.status} /></Td>
                  <Td className="text-green-600">{stats.present + stats.late} / {stats.total}</Td>
                  <Td className="text-red-500">{stats.absent}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {s.status === "upcoming" && canManage && (
                        <Button size="sm" onClick={() => openSession(s.id)}>Open</Button>
                      )}
                      {s.status === "open" && canManage && (
                        <Button size="sm" variant="danger" onClick={() => closeSession(s.id)}>Close</Button>
                      )}
                      <Link href={`/trainings/${id}/sessions/${s.id}`}>
                        <Button size="sm" variant="ghost">View</Button>
                      </Link>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Card>

      {/* Participant roster */}
      <Card>
        <CardHeader>
          <CardTitle>Participants ({participants.length})</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/api/export/qr-bulk?training_id=${id}`, "_blank")}
            >
              <Download size={14} /> QR Codes
            </Button>
            {canManageParticipants && (
              <Link href={`/participants?enroll=${id}`}>
                <Button size="sm"><Plus size={14} /> Add</Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Attendance Rate</Th>
              <Th></Th>
            </tr>
          </Thead>
          <Tbody>
            {participants.length === 0 ? <EmptyRow cols={4} message="No participants enrolled" /> : participants.map((p) => {
              const rate = getParticipantRate(p.id);
              return (
                <Tr key={p.id} onClick={() => router.push(`/participants/${p.id}`)}>
                  <Td className="font-medium">{p.full_name}</Td>
                  <Td className="text-gray-500">{p.phone || "—"}</Td>
                  <Td>
                    {rate !== null ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getAttendanceColorClass(rate)}`}>
                        {rate}%
                      </span>
                    ) : "—"}
                  </Td>
                  <Td>
                    <Link href={`/participants/${p.id}`} className="text-blue-600 text-xs hover:underline">View</Link>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Card>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        danger
        title="Delete Training"
        message="This will permanently delete the training and all its sessions and attendance records. This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}
