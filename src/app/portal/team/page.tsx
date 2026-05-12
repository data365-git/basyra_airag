"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/providers/LanguageProvider";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Loader2,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

interface AttendanceSummary {
  present: number;
  late: number;
  excused?: number;
  absent: number;
  total: number;
}

interface TrainingProgress {
  id: string;
  name: string;
  color: string;
  status: string;
  attendance_percent: number;
  homework_completion_percent: number;
  average_score: number | null;
  overall_score: number;
  risk_status: RiskStatus;
}

type RiskStatus = "low" | "medium" | "high" | "unknown";

interface TeamMember {
  link_id: string | null;
  participant: {
    id: string;
    full_name: string;
    phone: string | null;
    trainings: Array<{ id: string; name: string; color: string; status?: string }>;
    attendance_summary: AttendanceSummary;
    attendance_percent?: number;
    homework_completion_percent?: number;
    average_score?: number | null;
    overall_score?: number;
    risk_status?: RiskStatus;
    last_activity?: string | null;
    training_progress?: TrainingProgress[];
  };
}

interface TeamSummary {
  employee_count: number;
  avg_attendance_percent: number;
  avg_homework_completion_percent: number;
  avg_score: number | null;
  risk_counts: Record<RiskStatus, number>;
}

interface TeamResponse {
  employees: TeamMember[];
  summary: TeamSummary;
  legacy_links: number;
}

type TeamPayload = Omit<TeamResponse, "summary"> & {
  summary?: TeamSummary;
};

function portalFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("portal_token")
    : null;
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function attendancePercent(summary: AttendanceSummary): number {
  if (summary.total === 0) return 0;
  const excused = summary.excused ?? 0;
  return Math.round(((summary.present + summary.late + excused) / summary.total) * 100);
}

function normalizeTeamResponse(data: TeamPayload | TeamMember[]): TeamResponse {
  if (!Array.isArray(data)) {
    return {
      ...data,
      summary: data.summary ?? buildSummary(data.employees ?? []),
    };
  }

  const employees = data;

  return {
    employees,
    summary: buildSummary(employees),
    legacy_links: employees.length,
  };
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildSummary(employees: TeamMember[]): TeamSummary {
  const riskCounts: Record<RiskStatus, number> = { low: 0, medium: 0, high: 0, unknown: 0 };
  const scores: number[] = [];

  for (const member of employees) {
    const participant = member.participant;
    riskCounts[participant.risk_status ?? "unknown"]++;
    if (participant.average_score != null) scores.push(participant.average_score);
  }

  return {
    employee_count: employees.length,
    avg_attendance_percent: avg(employees.map((member) => (
      member.participant.attendance_percent ?? attendancePercent(member.participant.attendance_summary)
    ))) ?? 0,
    avg_homework_completion_percent: avg(employees.map((member) => member.participant.homework_completion_percent ?? 0)) ?? 0,
    avg_score: avg(scores),
    risk_counts: riskCounts,
  };
}

function riskTone(status: RiskStatus | undefined, t: (key: string, fallback?: string) => string): { label: string; cls: string } {
  if (status === "low") return { label: t("portal.team.status_stable", "Stable"), cls: "bg-emerald-50 text-emerald-700 border-emerald-100" };
  if (status === "medium") return { label: t("portal.team.status_watch", "Watch"), cls: "bg-amber-50 text-amber-700 border-amber-100" };
  if (status === "high") return { label: t("portal.team.status_at_risk", "At risk"), cls: "bg-rose-50 text-rose-700 border-rose-100" };
  return { label: t("portal.team.no_progress", "No data"), cls: "bg-slate-50 text-slate-500 border-slate-100" };
}

function fmtPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value}%`;
}

function dateLocale(language: string): string {
  if (language === "ru") return "ru-RU";
  if (language === "en") return "en-US";
  return "uz-UZ";
}

function fmtDate(value: string | null | undefined, locale: string, emptyLabel: string): string {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function MetricPill({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white/80 border border-white/70 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function ProgressBar({ value, color = "#0F766E" }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}

function EmployeeRow({ member }: { member: TeamMember }) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const p = member.participant;
  const attendance = p.attendance_percent ?? attendancePercent(p.attendance_summary);
  const homework = p.homework_completion_percent ?? 0;
  const averageScore = p.average_score ?? null;
  const overall = p.overall_score ?? Math.round((attendance + homework + (averageScore ?? 0)) / 3);
  const risk = riskTone(p.risk_status, t);
  const locale = dateLocale(language);
  const initials = p.full_name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => router.push(`/portal/team/${encodeURIComponent(p.id)}`)}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-slate-950">{p.full_name}</p>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${risk.cls}`}>
              {risk.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {p.phone ?? t("portal.team.no_phone", "No phone")} · {fmtDate(p.last_activity, locale, t("portal.team.no_recent_activity", "No recent activity"))}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-slate-950">{overall}%</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("portal.team.overall", "overall")}</p>
        </div>
      </button>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("portal.team.attendance", "Attendance")}</p>
          <ProgressBar value={attendance} color="#10B981" />
          <p className="mt-1 text-xs font-bold text-slate-700">{attendance}%</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("portal.team.homework", "Homework")}</p>
          <ProgressBar value={homework} color="#F59E0B" />
          <p className="mt-1 text-xs font-bold text-slate-700">{homework}%</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("portal.team.score", "Score")}</p>
          <ProgressBar value={averageScore ?? 0} color="#2563EB" />
          <p className="mt-1 text-xs font-bold text-slate-700">{fmtPercent(averageScore)}</p>
        </div>
      </div>
    </div>
  );
}

function TeamScorecard({ team }: { team: TeamResponse }) {
  const { t } = useTranslation();
  const highRisk = team.summary.risk_counts.high ?? 0;

  return (
    <section className="space-y-3">
      <div className="relative overflow-hidden rounded-[2rem] border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-amber-50 p-5 shadow-sm">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-teal-200/30" />
        <div className="absolute -bottom-12 left-10 h-28 w-28 rounded-full bg-amber-200/30" />
        <div className="relative">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm">
              <Users size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black text-slate-950">{t("portal.team.summary_title", "Supervisor team")}</p>
              <p className="text-xs font-medium text-slate-500">
                {t("portal.team.summary_count", { count: String(team.summary.employee_count) }, "{count} employees in portal view")}
              </p>
            </div>
            {highRisk > 0 && (
              <span className="flex shrink-0 items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                <ShieldAlert size={12} />
                {t("portal.team.risk_count", { count: String(highRisk) }, "{count} risk")}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MetricPill
              icon={<CalendarClock size={12} />}
              label={t("portal.team.attendance", "Attendance")}
              value={fmtPercent(team.summary.avg_attendance_percent)}
            />
            <MetricPill
              icon={<BarChart3 size={12} />}
              label={t("portal.team.homework", "Homework")}
              value={fmtPercent(team.summary.avg_homework_completion_percent)}
            />
            <MetricPill
              icon={<TrendingUp size={12} />}
              label={t("portal.team.avg_score", "Avg score")}
              value={fmtPercent(team.summary.avg_score)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {team.employees.map((member) => (
          <EmployeeRow key={`${member.participant.id}:${member.link_id ?? "team"}`} member={member} />
        ))}
      </div>
    </section>
  );
}

export default function TeamPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await portalFetch("/api/portal/team");
      if (res.status === 401) {
        router.replace("/portal/login");
        return;
      }
      if (res.ok) {
        const data = await res.json() as TeamPayload | TeamMember[];
        setTeam(normalizeTeamResponse(data));
      }
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={32} className="animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F4EC] pb-10">
      <div className="sticky top-0 z-10 border-b border-white/60 bg-[#F7F4EC]/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            onClick={() => router.push("/portal/me")}
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            {t("portal.team.back", "Back")}
          </button>
          <div className="flex items-center gap-2">
            <Users size={17} className="text-teal-700" />
            <p className="text-sm font-black text-slate-950">{t("portal.team.title", "Team Portal")}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 pt-5">
        {!team || team.employees.length === 0 ? (
          <div className="rounded-[2rem] border border-white bg-white/80 p-8 text-center shadow-sm">
            <Users size={34} className="mx-auto mb-3 text-slate-300" />
            <p className="font-bold text-slate-700">{t("portal.team.empty", "You do not supervise anyone yet")}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">{t("portal.team.section_label", "Supervisor overview")}</p>
              <h1 className="mt-1 text-3xl font-black leading-tight text-slate-950">
                {t("portal.team.scorecard_heading", "Team progress scorecard")}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {t("portal.team.scorecard_subtitle", "Attendance, homework completion, scores, and risk signals for employees you supervise.")}
              </p>
            </div>

            <TeamScorecard team={team} />
          </div>
        )}
      </div>
    </div>
  );
}
