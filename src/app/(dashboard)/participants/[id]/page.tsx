"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Edit, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { QRCodeDisplay } from "@/components/participants/QRCodeDisplay";
import { AttendanceBadge, TrainingStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { formatDate, getAttendanceColorClass } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import type { Participant } from "@/types";

export default function ParticipantProfilePage() {
  const { id } = useParams<{ id: string }>();
  const canManage = usePermission("manage_participants");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [attendanceByTraining, setAttendanceByTraining] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const supabase = createClient();
    const { data: p } = await supabase
      .from("participants")
      .select("*, training_participants(enrolled_at, training:trainings(id, name, color, status, start_date, end_date))")
      .eq("id", id)
      .single();

    if (!p) { setLoading(false); return; }
    setParticipant(p);

    const enrolledTrainings = (p.training_participants || []).map((tp: any) => tp.training);
    setTrainings(enrolledTrainings);

    // Load attendance for each training
    const byTraining: Record<string, any[]> = {};
    for (const training of enrolledTrainings) {
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, session_number, session_date, status")
        .eq("training_id", training.id)
        .order("session_number");

      const { data: att } = await supabase
        .from("attendance")
        .select("*")
        .eq("participant_id", id)
        .in("session_id", (sessions || []).map((s: any) => s.id));

      // Merge sessions with attendance
      byTraining[training.id] = (sessions || []).map((s: any) => ({
        ...s,
        record: (att || []).find((a: any) => a.session_id === s.id),
      }));
    }
    setAttendanceByTraining(byTraining);
    setLoading(false);
  }

  function getStats(trainingId: string) {
    const rows = attendanceByTraining[trainingId] || [];
    const closed = rows.filter((r) => r.status === "closed");
    const present = closed.filter((r) => r.record?.status === "present" || r.record?.status === "late").length;
    const absent = closed.filter((r) => r.record?.status === "absent").length;
    const excused = closed.filter((r) => r.record?.status === "excused").length;
    const rate = closed.length > 0 ? Math.round((present / closed.length) * 100) : 0;

    // Calculate streak
    let streak = 0;
    for (let i = closed.length - 1; i >= 0; i--) {
      const st = closed[i].record?.status;
      if (st === "present" || st === "late") { streak++; } else { break; }
    }

    return { total: closed.length, present, absent, excused, rate, streak };
  }

  if (loading) return <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div>;
  if (!participant) return <div className="text-center py-16 text-gray-400">Participant not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={participant.full_name}
        subtitle={participant.phone || participant.email || "Participant"}
        back
        backHref="/participants"
        actions={
          canManage && (
            <Link href={`/participants/${id}/edit`}>
              <Button variant="outline" size="sm"><Edit size={14} /> Edit</Button>
            </Link>
          )
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* QR Code */}
        <Card>
          <CardTitle className="mb-4">QR Code</CardTitle>
          <QRCodeDisplay token={participant.qr_token} name={participant.full_name} />
          <div className="mt-4 pt-4 border-t space-y-2 text-sm">
            {participant.phone && (
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="font-medium">{participant.phone}</span>
              </div>
            )}
            {participant.email && (
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium">{participant.email}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Registered</span>
              <span className="font-medium">{formatDate(participant.created_at)}</span>
            </div>
          </div>
        </Card>

        {/* Training stats */}
        <div className="lg:col-span-2 space-y-4">
          {trainings.length === 0 ? (
            <Card>
              <p className="text-gray-400 text-center py-6">Not enrolled in any training</p>
            </Card>
          ) : trainings.map((training) => {
            const stats = getStats(training.id);
            const rows = attendanceByTraining[training.id] || [];

            return (
              <Card key={training.id}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-8 rounded-sm" style={{ backgroundColor: training.color }} />
                  <div className="flex-1">
                    <Link href={`/trainings/${training.id}`} className="font-semibold text-gray-900 hover:text-blue-600">
                      {training.name}
                    </Link>
                  </div>
                  <TrainingStatusBadge status={training.status} />
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {[
                    { label: "Sessions", value: stats.total },
                    { label: "Present", value: stats.present, cls: "text-green-600" },
                    { label: "Absent", value: stats.absent, cls: "text-red-500" },
                    { label: "Excused", value: stats.excused, cls: "text-blue-600" },
                    { label: "Streak", value: `${stats.streak}🔥` },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className={`text-lg font-bold ${s.cls || "text-gray-900"}`}>{s.value}</div>
                      <div className="text-xs text-gray-500">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Rate */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${stats.rate >= 80 ? "bg-green-500" : stats.rate >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${stats.rate}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold ${getAttendanceColorClass(stats.rate)} px-2 py-0.5 rounded-full`}>
                    {stats.rate}%
                  </span>
                </div>

                {/* Session history */}
                <details>
                  <summary className="text-sm text-blue-600 cursor-pointer hover:underline">
                    View session history ({rows.length} sessions)
                  </summary>
                  <div className="mt-3">
                    <Table>
                      <Thead>
                        <tr>
                          <Th>#</Th>
                          <Th>Date</Th>
                          <Th>Status</Th>
                          <Th>Note</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {rows.length === 0 ? <EmptyRow cols={4} /> : rows.map((row) => (
                          <Tr key={row.id}>
                            <Td>{row.session_number}</Td>
                            <Td>{formatDate(row.session_date)}</Td>
                            <Td>
                              {row.status === "closed" ? (
                                <AttendanceBadge status={row.record?.status || "absent"} />
                              ) : (
                                <span className="text-xs text-gray-400 capitalize">{row.status}</span>
                              )}
                            </Td>
                            <Td className="text-xs text-gray-500">{row.record?.note || "—"}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
