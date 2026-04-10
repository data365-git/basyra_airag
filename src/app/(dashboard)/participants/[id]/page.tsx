"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Edit } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { QRCodeDisplay } from "@/components/participants/QRCodeDisplay";
import { AttendanceBadge, TrainingStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { formatDate, getAttendanceColorClass } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import type { Participant } from "@/types";

export default function ParticipantProfilePage() {
  const { id } = useParams<{ id: string }>();
  const canManage = usePermission("participants", "edit");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/participants/${id}`).then((r) => r.json()),
      fetch(`/api/participants/${id}/history`).then((r) => r.json()),
    ]).then(([p, h]) => {
      setParticipant(p);
      setHistory(Array.isArray(h) ? h : []);
      setLoading(false);
    });
  }, [id]);

  function getStats(sessions: any[]) {
    const closed = sessions.filter((s) => s.status === "closed");
    const present = closed.filter((s) => s.record?.status === "present" || s.record?.status === "late").length;
    const absent = closed.filter((s) => s.record?.status === "absent").length;
    const excused = closed.filter((s) => s.record?.status === "excused").length;
    const rate = closed.length > 0 ? Math.round((present / closed.length) * 100) : 0;

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
          {history.length === 0 ? (
            <Card>
              <p className="text-gray-400 text-center py-6">Not enrolled in any training</p>
            </Card>
          ) : history.map((item) => {
            const stats = getStats(item.sessions);
            return (
              <Card key={item.trainingId}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-8 rounded-sm" style={{ backgroundColor: item.training.color }} />
                  <div className="flex-1">
                    <Link href={`/trainings/${item.trainingId}`} className="font-semibold text-gray-900 hover:text-blue-600">
                      {item.training.name}
                    </Link>
                  </div>
                  <TrainingStatusBadge status={item.training.status} />
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

                {/* Rate bar */}
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
                    View session history ({item.sessions.length} sessions)
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
                        {item.sessions.length === 0 ? <EmptyRow cols={4} /> : item.sessions.map((row: any) => (
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
