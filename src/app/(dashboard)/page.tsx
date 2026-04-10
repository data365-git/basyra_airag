"use client";

import { useEffect, useState } from "react";
import { Users, BookOpen, BarChart3, QrCode } from "lucide-react";
import Link from "next/link";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { TodaysSessions } from "@/components/dashboard/TodaysSessions";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { TrainingStatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatTime } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import toast from "react-hot-toast";

export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalParticipants: 0, totalTrainings: 0, activeTrainings: 0, avgRate: 0 });
  const [todaysSessions, setTodaysSessions] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeTrainings, setActiveTrainings] = useState<any[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];

    const [
      { count: participantsCount },
      { data: trainings },
      { data: todaySessions },
      { data: recentScans },
    ] = await Promise.all([
      supabase.from("participants").select("*", { count: "exact", head: true }),
      supabase.from("trainings").select("*"),
      supabase.from("sessions").select("*, training:trainings(name, color)").eq("session_date", today),
      supabase.from("attendance")
        .select("*, participant:participants(full_name), session:sessions(session_number, training:trainings(name, color))")
        .eq("status", "present")
        .order("scanned_at", { ascending: false })
        .limit(20),
    ]);

    const active = (trainings || []).filter((t) => t.status === "active");
    setStats({
      totalParticipants: participantsCount || 0,
      totalTrainings: (trainings || []).length,
      activeTrainings: active.length,
      avgRate: 0,
    });

    setTodaysSessions(todaySessions || []);
    setRecentActivity(recentScans || []);
    setActiveTrainings(active.slice(0, 4));

    // Compute alerts
    if (trainings) {
      const alertList: any[] = [];
      for (const t of active) {
        const { data: enrolled } = await supabase
          .from("training_participants")
          .select("participant_id, participant:participants(full_name)")
          .eq("training_id", t.id);

        const { data: sessionData } = await supabase
          .from("sessions")
          .select("id")
          .eq("training_id", t.id)
          .eq("status", "closed");

        const sessionIds = (sessionData || []).map((s: any) => s.id);
        if (!sessionIds.length) continue;

        for (const e of enrolled || []) {
          const { count: presentCount } = await supabase
            .from("attendance")
            .select("*", { count: "exact", head: true })
            .eq("participant_id", e.participant_id)
            .in("session_id", sessionIds)
            .in("status", ["present", "late"]);

          const rate = sessionIds.length > 0 ? Math.round(((presentCount || 0) / sessionIds.length) * 100) : 100;
          if (rate < t.attendance_threshold) {
            alertList.push({
              participantId: e.participant_id,
              participantName: (e.participant as any)?.full_name || "",
              trainingId: t.id,
              trainingName: t.name,
              rate,
              threshold: t.attendance_threshold,
            });
          }
        }
      }
      setAlerts(alertList);
    }

    setLoading(false);
  }

  async function openSession(id: string) {
    await fetch(`/api/sessions/${id}/open`, { method: "POST" });
    toast.success("Session opened");
    loadDashboard();
  }

  async function closeSession(id: string) {
    await fetch(`/api/sessions/${id}/close`, { method: "POST" });
    toast.success("Session closed — absent participants marked");
    loadDashboard();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {user?.name?.split(" ")[0] || "Staff"} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">{formatDate(new Date().toISOString())}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Participants" value={stats.totalParticipants} icon={Users} color="blue" />
        <StatsCard title="Trainings" value={stats.totalTrainings} icon={BookOpen} color="purple" />
        <StatsCard title="Active" value={stats.activeTrainings} icon={QrCode} color="green" />
        <StatsCard title="Today's Sessions" value={todaysSessions.length} icon={BarChart3} color="yellow" />
      </div>

      {/* Today's sessions */}
      {hasPermission(user, "manage_trainings") && (
        <TodaysSessions
          sessions={todaysSessions}
          onOpen={openSession}
          onClose={closeSession}
        />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active trainings */}
        {hasPermission(user, "view_trainings") && (
          <Card>
            <CardHeader>
              <CardTitle>Active Trainings</CardTitle>
              <Link href="/trainings" className="text-sm text-blue-600 hover:underline">View all</Link>
            </CardHeader>
            {activeTrainings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No active trainings</p>
            ) : (
              <div className="space-y-2">
                {activeTrainings.map((t) => (
                  <Link key={t.id} href={`/trainings/${t.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                    <div className="w-3 h-10 rounded-sm" style={{ backgroundColor: t.color }} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(t.start_date)} — {formatDate(t.end_date)}
                      </p>
                    </div>
                    <TrainingStatusBadge status={t.status} />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Alerts */}
        <AlertsPanel alerts={alerts} />
      </div>

      {/* Recent activity */}
      <ActivityFeed activities={recentActivity} />
    </div>
  );
}
