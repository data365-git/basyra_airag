"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { QRCodeDisplay } from "@/components/participants/QRCodeDisplay";
import { AttendanceBadge, TrainingStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/Modal";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { formatDate, getAttendanceColorClass } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";
import type { Participant } from "@/types";

export default function ParticipantProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const canManage = usePermission("participants", "edit");
  const canDelete = usePermission("participants", "delete");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/participants/${id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast.success(t("participants.deleted"));
      router.refresh();
      router.push("/participants");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("common.no_data"));
    }
  }

  if (loading) return <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div>;
  if (!participant) return <div className="text-center py-16 text-gray-400">{t("participants.not_found")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={participant.full_name}
        subtitle={participant.phone || participant.email || "Participant"}
        back
        backHref="/participants"
        actions={
          <>
            {canManage && (
              <Link href={`/participants/${id}/edit`}>
                <Button variant="outline" size="sm"><Edit size={14} /> {t("common.edit")}</Button>
              </Link>
            )}
            {canDelete && (
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={14} />
              </Button>
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* QR Code */}
        <Card>
          <CardTitle className="mb-4">{t("participants.qr_code")}</CardTitle>
          <QRCodeDisplay token={participant.qr_token} name={participant.full_name} />
          <div className="mt-4 pt-4 border-t space-y-2 text-sm">
            {participant.phone && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t("common.phone")}</span>
                <span className="font-medium">{participant.phone}</span>
              </div>
            )}
            {participant.email && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t("common.email")}</span>
                <span className="font-medium">{participant.email}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">{t("participants.registered_col")}</span>
              <span className="font-medium">{formatDate(participant.created_at)}</span>
            </div>
          </div>
        </Card>

        {/* Training stats */}
        <div className="lg:col-span-2 space-y-4">
          {history.length === 0 ? (
            <Card>
              <p className="text-gray-400 text-center py-6">{t("participants.no_trainings")}</p>
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
                    { label: t("participants.sessions_col"), value: stats.total },
                    { label: t("common.status.present"), value: stats.present, cls: "text-green-600" },
                    { label: t("common.status.absent"), value: stats.absent, cls: "text-red-500" },
                    { label: t("common.status.excused"), value: stats.excused, cls: "text-blue-600" },
                    { label: t("participants.streak"), value: `${stats.streak}🔥` },
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
                    {t("participants.view_history", { n: item.sessions.length })}
                  </summary>
                  <div className="mt-3">
                    <Table>
                      <Thead>
                        <tr>
                          <Th>#</Th>
                          <Th>{t("common.date")}</Th>
                          <Th>{t("common.status")}</Th>
                          <Th>{t("common.note")}</Th>
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

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        danger
        title={t("participants.delete_title")}
        message={`Delete "${participant.full_name}"? This will also remove all their attendance records. This cannot be undone.`}
        confirmLabel={deleting ? t("common.deleting") : t("common.delete")}
      />
    </div>
  );
}
