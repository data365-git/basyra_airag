"use client";

import { useEffect, useState } from "react";
import { Download, Filter } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { formatDate, getAttendanceColorClass } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";

export default function ReportsPage() {
  const canView = usePermission("reports", "view");
  const [trainings, setTrainings] = useState<any[]>([]);
  const [selectedTraining, setSelectedTraining] = useState("");
  const [loading, setLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState<{
    sessions: any[];
    participants: any[];
    records: any[];
  }>({ sessions: [], participants: [], records: [] });

  useEffect(() => {
    fetch("/api/trainings")
      .then((r) => r.json())
      .then((data) => setTrainings(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    if (selectedTraining) loadHeatmap(selectedTraining);
  }, [selectedTraining]);

  async function loadHeatmap(trainingId: string) {
    setLoading(true);
    const data = await fetch(`/api/reports?training_id=${trainingId}`).then((r) => r.json());
    setHeatmapData({
      sessions: data.sessions || [],
      participants: data.participants || [],
      records: data.records || [],
    });
    setLoading(false);
  }

  function getStatus(participantId: string, sessionId: string) {
    const rec = heatmapData.records.find(
      (r) => r.participant_id === participantId && r.session_id === sessionId
    );
    return rec?.status || "absent";
  }

  function getParticipantRate(participantId: string) {
    const { sessions, records } = heatmapData;
    if (!sessions.length) return 0;
    const present = records.filter(
      (r) => r.participant_id === participantId && (r.status === "present" || r.status === "late")
    ).length;
    return Math.round((present / sessions.length) * 100);
  }

  const statusCell: Record<string, string> = {
    present: "bg-green-500",
    late: "bg-yellow-400",
    excused: "bg-blue-400",
    absent: "bg-red-400",
  };

  const statusTitle: Record<string, string> = {
    present: "Present",
    late: "Late",
    excused: "Excused",
    absent: "Absent",
  };

  const rankedParticipants = [...heatmapData.participants]
    .map((p) => ({ ...p, rate: getParticipantRate(p.id) }))
    .sort((a, b) => b.rate - a.rate);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Attendance analytics and export"
        actions={
          selectedTraining && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/export/attendance?training_id=${selectedTraining}`, "_blank")}
            >
              <Download size={14} /> Export Excel
            </Button>
          )
        }
      />

      {/* Training selector */}
      <Card>
        <div className="flex items-center gap-3">
          <Filter size={16} className="text-gray-500" />
          <select
            value={selectedTraining}
            onChange={(e) => setSelectedTraining(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a training to view report...</option>
            {trainings.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : selectedTraining && heatmapData.sessions.length > 0 ? (
        <>
          {/* Attendance Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle>Attendance Heatmap</CardTitle>
              <div className="flex gap-2 text-xs">
                {Object.entries(statusTitle).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className={`w-3 h-3 rounded-sm inline-block ${statusCell[k]}`} />
                    {v}
                  </span>
                ))}
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 w-40 font-medium text-gray-600">Participant</th>
                    {heatmapData.sessions.map((s) => (
                      <th key={s.id} className="px-1 py-2 text-center min-w-[36px] font-medium text-gray-500">
                        <div>S{s.session_number}</div>
                        <div className="text-[10px] text-gray-400">{formatDate(s.session_date, "MM/dd")}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedParticipants.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-medium text-gray-800 whitespace-nowrap">{p.full_name}</td>
                      {heatmapData.sessions.map((s) => {
                        const status = getStatus(p.id, s.id);
                        return (
                          <td key={s.id} className="px-1 py-1.5 text-center">
                            <div
                              className={`w-7 h-7 rounded-sm mx-auto ${statusCell[status] || "bg-gray-200"}`}
                              title={statusTitle[status] || status}
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getAttendanceColorClass(p.rate)}`}>
                          {p.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Rankings */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Attendance Ranking</CardTitle></CardHeader>
              <Table>
                <Thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Participant</Th>
                    <Th>Rate</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {rankedParticipants.length === 0 ? <EmptyRow cols={3} /> : rankedParticipants.map((p, i) => (
                    <Tr key={p.id}>
                      <Td className="text-gray-500 font-medium">{i + 1}</Td>
                      <Td className="font-medium">{p.full_name}</Td>
                      <Td>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getAttendanceColorClass(p.rate)}`}>
                          {p.rate}%
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>

            <Card>
              <CardHeader><CardTitle>Session Summary</CardTitle></CardHeader>
              <Table>
                <Thead>
                  <tr>
                    <Th>Session</Th>
                    <Th>Date</Th>
                    <Th>Present</Th>
                    <Th>Rate</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {heatmapData.sessions.length === 0 ? <EmptyRow cols={4} /> : heatmapData.sessions.map((s) => {
                    const sessionRecords = heatmapData.records.filter((r) => r.session_id === s.id);
                    const present = sessionRecords.filter((r) => r.status === "present" || r.status === "late").length;
                    const total = heatmapData.participants.length;
                    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
                    return (
                      <Tr key={s.id}>
                        <Td>Session {s.session_number}</Td>
                        <Td>{formatDate(s.session_date, "MMM d")}</Td>
                        <Td>{present}/{total}</Td>
                        <Td>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${getAttendanceColorClass(rate)}`}>{rate}%</span>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Card>
          </div>
        </>
      ) : selectedTraining ? (
        <Card>
          <p className="text-center text-gray-400 py-8">No closed sessions yet for this training</p>
        </Card>
      ) : null}
    </div>
  );
}
