"use client";

import { useEffect, useState } from "react";
import { Users, BookOpen, BarChart3, QrCode } from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { TodaysSessions } from "@/components/dashboard/TodaysSessions";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { formatDate, formatTime } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    const res = await fetch("/api/dashboard").then((r) => r.json());
    setData(res);
    setLoading(false);
  }

  async function openSession(id: string) {
    await fetch(`/api/sessions/${id}/open`, { method: "POST" });
    toast.success(t("dashboard.session_opened"));
    loadDashboard();
  }

  async function closeSession(id: string) {
    await fetch(`/api/sessions/${id}/close`, { method: "POST" });
    toast.success(t("dashboard.session_closed"));
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

  const { stats, todaysSessions, recentActivity, activeTrainings, alerts } = data || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t(
            new Date().getHours() < 12
              ? "dashboard.greeting_morning"
              : "dashboard.greeting_afternoon",
            { name: user?.name?.split(" ")[0] || "Staff" }
          )}
        </h1>
        <p className="text-gray-500 text-sm mt-1">{formatDate(new Date().toISOString())}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title={t("dashboard.participants")}    value={stats?.totalParticipants || 0} icon={Users}    color="blue"   />
        <StatsCard title={t("dashboard.trainings")}       value={stats?.totalTrainings || 0}    icon={BookOpen} color="purple" />
        <StatsCard title={t("dashboard.active")}          value={stats?.activeTrainings || 0}   icon={QrCode}   color="green"  />
        <StatsCard title={t("dashboard.today_sessions")}  value={(todaysSessions || []).length}  icon={BarChart3} color="yellow" />
      </div>

      {/* Today's sessions */}
      {hasPermission(user, "trainings", "edit") && (
        <TodaysSessions
          sessions={todaysSessions || []}
          onOpen={openSession}
          onClose={closeSession}
        />
      )}

      {/* Alerts */}
      <AlertsPanel alerts={alerts || []} />

      {/* Recent activity */}
      <ActivityFeed activities={recentActivity || []} />
    </div>
  );
}
