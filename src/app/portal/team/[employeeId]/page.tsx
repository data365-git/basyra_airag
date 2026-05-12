"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Star,
  User,
} from "lucide-react";
import { useTranslation } from "@/providers/LanguageProvider";

type AttendanceStatus = "present" | "late" | "excused" | "absent" | string;

interface AttendanceHistoryEntry {
  date: string;
  session_number: number;
  status: AttendanceStatus;
}

interface HomeworkItem {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
  submission: {
    id: string;
    submitted_at: string;
    is_late: boolean;
    late_by_days: number | null;
    grade: { score: number; feedback: string | null } | null;
  } | null;
}

interface ScorecardData {
  attendance: {
    total: number;
    present: number;
    late: number;
    excused: number;
    absent: number;
    rate: number;
  };
  homework: {
    total: number;
    submitted: number;
    graded: number;
    avgScore: number | null;
    submitRate: number;
    deadlineComplianceRate: number | null;
    onTimeCount: number;
    deadlineEligibleCount: number;
  };
  activity: { count: number; avgScore: number | null };
  overallScore: number;
  attendanceHistory: AttendanceHistoryEntry[];
  homeworks: HomeworkItem[];
}

interface TeamMemberScorecardResponse {
  employee: {
    id: string;
    full_name: string;
    phone: string | null;
  };
  trainings: Array<{
    training: { id: string; name: string; color: string; status: string };
    scorecard: ScorecardData;
  }>;
}

function portalFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("portal_token") : null;
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function scoreColor(value: number) {
  if (value >= 80) return "#22C55E";
  if (value >= 60) return "#F59E0B";
  return "#EF4444";
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function attendanceLabel(status: AttendanceStatus) {
  if (status === "present") return { label: "Keldi", cls: "text-green-600 bg-green-50" };
  if (status === "late") return { label: "Kech", cls: "text-amber-600 bg-amber-50" };
  if (status === "excused") return { label: "Sababli", cls: "text-blue-500 bg-blue-50" };
  return { label: "Kelmadi", cls: "text-red-500 bg-red-50" };
}

function riskFromScore(score: number) {
  if (score >= 75) return { labelKey: "portal.team.status_stable", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" };
  if (score >= 55) return { labelKey: "portal.team.status_watch", cls: "bg-amber-50 text-amber-700 border-amber-100" };
  return { labelKey: "portal.team.status_at_risk", cls: "bg-rose-50 text-rose-700 border-rose-100" };
}

function TopScorecard({
  name,
  training,
  sc,
}: {
  name: string;
  training: TeamMemberScorecardResponse["trainings"][number]["training"];
  sc: ScorecardData;
}) {
  const { t } = useTranslation();
  const color = training.color || "#2563EB";

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-5 text-white shadow-lg"
      style={{ background: `linear-gradient(135deg, ${color}ff 0%, ${color}99 100%)` }}
    >
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/5" />
      <div className="relative mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl font-black backdrop-blur-sm">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight">{name}</p>
          <p className="mt-0.5 truncate text-xs opacity-70">{training.name}</p>
        </div>
      </div>

      <div className="relative my-4 text-center">
        <p className="text-7xl font-black leading-none" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          {sc.overallScore}
        </p>
        <p className="mt-2 text-sm font-semibold uppercase tracking-widest opacity-60">
          {t("portal.team.overall")}
        </p>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-0 border-t border-white/20 pt-4">
        <div className="text-center">
          <p className="text-2xl font-bold">{sc.attendance.rate}%</p>
          <p className="mt-0.5 text-xs opacity-60">{t("portal.team.attendance")}</p>
        </div>
        <div className="border-x border-white/20 text-center">
          <p className="text-2xl font-bold">{sc.homework.avgScore ?? 0}%</p>
          <p className="mt-0.5 text-xs opacity-60">{t("portal.team.homework")}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{sc.homework.deadlineComplianceRate ?? 0}%</p>
          <p className="mt-0.5 text-xs opacity-60">Muddat</p>
        </div>
      </div>
    </div>
  );
}

function AttendanceCard({ sc }: { sc: ScorecardData }) {
  const [open, setOpen] = useState(false);
  const { t, language } = useTranslation();
  const color = scoreColor(sc.attendance.rate);

  return (
    <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">{t("portal.team_member.attendance_history")}</p>
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-sm font-bold" style={{ background: `${color}22`, color }}>
          {sc.attendance.rate}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div className="h-2 rounded-full" style={{ width: `${sc.attendance.rate}%`, background: color }} />
      </div>
      <div className="grid grid-cols-4 gap-2 pt-1">
        {[
          { label: "Keldi", value: sc.attendance.present, cls: "text-green-600" },
          { label: "Kech", value: sc.attendance.late, cls: "text-amber-600" },
          { label: "Sababli", value: sc.attendance.excused, cls: "text-blue-500" },
          { label: "Kelmadi", value: sc.attendance.absent, cls: "text-red-500" },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className={`text-xl font-bold ${item.cls}`}>{item.value}</p>
            <p className="mt-0.5 text-xs text-gray-400">{item.label}</p>
          </div>
        ))}
      </div>

      {sc.attendanceHistory.length > 0 && (
        <>
          <button
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-center gap-1.5 pt-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {t("portal.team_member.attendance_history")}
          </button>
          {open && (
            <div className="space-y-1.5 pt-1">
              {sc.attendanceHistory.map((entry) => {
                const { label, cls } = attendanceLabel(entry.status);
                return (
                  <div key={`${entry.date}-${entry.session_number}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-2 py-1.5 text-xs">
                    <span className="text-gray-500">
                      {entry.session_number}-dars · {formatDate(entry.date, language === "uz" ? "uz-UZ" : language)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HomeworkCard({ homework }: { homework: HomeworkItem }) {
  const [open, setOpen] = useState(false);
  const { t, language } = useTranslation();
  const hasSubmitted = Boolean(homework.submission);
  const hasGrade = Boolean(homework.submission?.grade);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50"
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          hasGrade ? "bg-green-100" : hasSubmitted ? "bg-blue-100" : "bg-gray-100"
        }`}>
          {hasGrade ? <Star size={15} className="text-green-600" /> : hasSubmitted ? <CheckCircle2 size={15} className="text-blue-600" /> : <Clock size={15} className="text-gray-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-snug text-gray-900">{homework.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {homework.due_date && (
              <p className="text-xs text-gray-400">
                Muddat: {formatDate(homework.due_date, language === "uz" ? "uz-UZ" : language)}
              </p>
            )}
            {hasGrade && (
              <span className="text-xs font-semibold text-green-600">
                {homework.submission!.grade!.score}/{homework.max_score}
              </span>
            )}
          </div>
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-50 px-4 pb-4 pt-3">
          {homework.description && <p className="text-sm leading-relaxed text-gray-600">{homework.description}</p>}
          {hasSubmitted && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3">
              <p className="text-xs font-medium text-blue-700">
                Topshirildi · {formatDate(homework.submission!.submitted_at, language === "uz" ? "uz-UZ" : language)}
              </p>
            </div>
          )}
          {hasGrade && (
            <div className="space-y-1 rounded-xl border border-green-100 bg-green-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-green-800">{t("portal.team.score")}</span>
                <span className="text-sm font-bold text-green-700">
                  {homework.submission!.grade!.score}/{homework.max_score}
                </span>
              </div>
              {homework.submission!.grade!.feedback && (
                <p className="text-xs leading-relaxed text-green-700">{homework.submission!.grade!.feedback}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrainingDetail({
  employeeName,
  item,
}: {
  employeeName: string;
  item: TeamMemberScorecardResponse["trainings"][number];
}) {
  const { t } = useTranslation();
  const sc = item.scorecard;

  return (
    <div className="space-y-4">
      <TopScorecard name={employeeName} training={item.training} sc={sc} />

      {sc.activity.count > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-gray-600">Murabbiy bahosi</p>
            <p className="mt-0.5 text-xs text-gray-400">Bu baho umumiy ballga ta&apos;sir qilmaydi</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-700">{sc.activity.avgScore !== null ? `${sc.activity.avgScore}%` : "-"}</p>
            <p className="text-xs text-gray-400">{sc.activity.count} dars</p>
          </div>
        </div>
      )}

      <AttendanceCard sc={sc} />

      <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-gray-400" />
            <p className="text-sm font-semibold text-gray-700">{t("portal.team_member.homework_history")}</p>
          </div>
          <span className="text-xs text-gray-400">
            {sc.homework.submitted}/{sc.homework.total}
          </span>
        </div>
        {sc.homework.total > 0 ? (
          <>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-blue-500" style={{ width: `${sc.homework.submitRate}%` }} />
            </div>
            {sc.homework.avgScore !== null && (
              <p className="text-xs text-gray-500">
                {t("portal.team.avg_score")}: <span className="font-semibold text-gray-800">{sc.homework.avgScore}%</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-xs italic text-gray-400">{t("portal.team_member.no_homeworks")}</p>
        )}
      </div>

      {sc.homeworks.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-sm font-semibold text-gray-600">{t("portal.team_member.homework_history")}</p>
          {sc.homeworks.map((homework) => (
            <HomeworkCard key={homework.id} homework={homework} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamMemberPage() {
  const router = useRouter();
  const params = useParams<{ employeeId: string }>();
  const { t } = useTranslation();
  const [data, setData] = useState<TeamMemberScorecardResponse | null>(null);
  const [selectedTrainingId, setSelectedTrainingId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await portalFetch(`/api/portal/team/${params.employeeId}/scorecard`);
      if (res.status === 401) {
        router.replace("/portal/login");
        return;
      }
      if (res.status === 403) {
        router.replace("/portal/team");
        return;
      }
      if (res.ok) {
        const payload = (await res.json()) as TeamMemberScorecardResponse;
        setData(payload);
        setSelectedTrainingId(payload.trainings[0]?.training.id ?? "");
      }
      setLoading(false);
    }

    load();
  }, [params.employeeId, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!data) return null;

  const active = data.trainings.find((item) => item.training.id === selectedTrainingId) ?? data.trainings[0];
  const risk = active ? riskFromScore(active.scorecard.overallScore) : null;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            onClick={() => router.push("/portal/team")}
            className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            {t("portal.team_member.back_to_team")}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <User size={16} className="text-blue-600" />
              <p className="truncate text-sm font-black text-gray-950">{data.employee.full_name}</p>
            </div>
            <p className="text-xs text-gray-400">{t("portal.team_member.viewing_as_supervisor")}</p>
          </div>
          {risk && (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${risk.cls}`}>
              {t(risk.labelKey)}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        {data.trainings.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {data.trainings.map((item) => (
              <button
                key={item.training.id}
                onClick={() => setSelectedTrainingId(item.training.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedTrainingId === item.training.id
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"
                }`}
              >
                {item.training.name}
              </button>
            ))}
          </div>
        )}

        {active ? (
          <TrainingDetail employeeName={data.employee.full_name} item={active} />
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-gray-400">
            {t("portal.team.no_progress")}
          </div>
        )}
      </div>
    </div>
  );
}
