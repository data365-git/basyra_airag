"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { ArrowLeft, Loader2, Calendar, BookOpen, Activity } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Training {
  id:    string;
  name:  string;
  color: string;
}

interface Scorecard {
  attendance: {
    total:   number;
    present: number;
    late:    number;
    excused: number;
    absent:  number;
    rate:    number;
  };
  homework: {
    total:                  number;
    submitted:              number;
    graded:                 number;
    avgScore:               number | null;
    submitRate:             number;
    deadlineComplianceRate: number | null;
  };
  activity: {
    count:    number;
    avgScore: number | null;
  };
  overallScore: number;
}

interface ReportData {
  participant:       { id: string; name: string };
  trainings:         Training[];
  selectedTrainingId: string;
  scorecard:         Scorecard;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(n: number): string {
  if (n >= 80) return "text-green-600";
  if (n >= 60) return "text-yellow-600";
  return "text-red-600";
}

function scoreBg(n: number): string {
  if (n >= 80) return "#22C55E";
  if (n >= 60) return "#F59E0B";
  return "#EF4444";
}

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function ScorecardDetail({ participantId }: { participantId: string }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const trainingId   = searchParams.get("trainingId") ?? "";

  const [data,    setData]    = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [selectedTrainingId, setSelectedTrainingId] = useState(trainingId);

  useEffect(() => {
    async function init() {
      const meRes = await fetch("/api/supervisor/auth/me");
      if (meRes.status === 401) {
        router.push("/supervisor/login");
        return;
      }

      const url = `/api/supervisor/reports/${participantId}${selectedTrainingId ? `?trainingId=${selectedTrainingId}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Ma'lumot yuklanmadi");
        setLoading(false);
        return;
      }
      const d = await res.json().catch(() => null);
      if (d) {
        setData(d);
        setSelectedTrainingId(d.selectedTrainingId);
      }
      setLoading(false);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, selectedTrainingId, router]);

  function switchTraining(tid: string) {
    setLoading(true);
    setSelectedTrainingId(tid);
    router.replace(`/supervisor/people/${participantId}?trainingId=${tid}`);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-red-500 text-sm">{error || "Xatolik"}</div>
    );
  }

  const { participant, trainings, scorecard: sc } = data;
  const activeTraining = trainings.find((t) => t.id === selectedTrainingId) ?? trainings[0];
  const color = activeTraining?.color ?? "#6366F1";

  return (
    <div className="space-y-5">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </button>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 truncate">{participant.name}</p>
          {activeTraining && (
            <p className="text-xs text-gray-400 truncate">{activeTraining.name}</p>
          )}
        </div>
      </div>

      {/* Training selector */}
      {trainings.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {trainings.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTraining(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selectedTrainingId === t.id
                  ? "text-white border-transparent"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}
              style={selectedTrainingId === t.id ? { backgroundColor: t.color, borderColor: t.color } : undefined}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* Overall score card */}
      <div
        className="rounded-3xl p-5 text-white relative overflow-hidden shadow-lg"
        style={{ background: `linear-gradient(135deg, ${color}ff 0%, ${color}99 100%)` }}
      >
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

        <div className="flex items-center gap-3 mb-5 relative">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-black shrink-0 backdrop-blur-sm">
            {participant.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-base leading-tight truncate">{participant.name}</p>
            {activeTraining && (
              <p className="text-xs opacity-70 mt-0.5 truncate">{activeTraining.name}</p>
            )}
          </div>
        </div>

        <div className="text-center my-4 relative">
          <p className="text-7xl font-black leading-none" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
            {sc.overallScore}
          </p>
          <p className="text-sm opacity-60 mt-2 uppercase tracking-widest font-semibold">Umumiy ball</p>
        </div>

        <div className="grid grid-cols-3 gap-0 mt-4 border-t border-white/20 pt-4 relative">
          <div className="text-center">
            <p className="text-2xl font-bold">{sc.attendance.rate}%</p>
            <p className="text-xs opacity-60 mt-0.5">Davomat</p>
          </div>
          <div className="text-center border-x border-white/20">
            <p className="text-2xl font-bold">{sc.homework.avgScore ?? "—"}{sc.homework.avgScore !== null ? "%" : ""}</p>
            <p className="text-xs opacity-60 mt-0.5">Vazifa</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">
              {sc.homework.deadlineComplianceRate !== null ? `${sc.homework.deadlineComplianceRate}%` : "—"}
            </p>
            <p className="text-xs opacity-60 mt-0.5">Muddat</p>
          </div>
        </div>
      </div>

      {/* Attendance card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-gray-400" />
            <p className="text-sm font-semibold text-gray-700">Davomat</p>
          </div>
          <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full bg-gray-100 ${scoreColor(sc.attendance.rate)}`}>
            {sc.attendance.rate}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-700"
            style={{ width: `${sc.attendance.rate}%`, background: scoreBg(sc.attendance.rate) }}
          />
        </div>
        <div className="grid grid-cols-4 gap-2 pt-1">
          {[
            { label: "Keldi",   value: sc.attendance.present, cls: "text-green-600" },
            { label: "Kech",    value: sc.attendance.late,    cls: "text-amber-600" },
            { label: "Sababli", value: sc.attendance.excused, cls: "text-blue-500"  },
            { label: "Kelmadi", value: sc.attendance.absent,  cls: "text-red-500"   },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className={`text-xl font-bold ${item.cls}`}>{item.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
        {sc.attendance.total > 0 && (
          <p className="text-xs text-gray-400 text-center">Jami {sc.attendance.total} dars</p>
        )}
      </div>

      {/* Homework card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-gray-400" />
            <p className="text-sm font-semibold text-gray-700">Vazifalar</p>
          </div>
          <span className="text-xs text-gray-400">
            {sc.homework.submitted}/{sc.homework.total} topshirildi
          </span>
        </div>
        {sc.homework.total > 0 ? (
          <>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-blue-500 transition-all duration-700"
                style={{ width: `${sc.homework.submitRate}%` }}
              />
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">O&apos;rtacha baho</span>
                <span className={`text-xs font-semibold ${sc.homework.avgScore !== null ? scoreColor(sc.homework.avgScore) : "text-gray-400"}`}>
                  {sc.homework.avgScore !== null ? `${sc.homework.avgScore}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Muddatga rioya</span>
                <span className={`text-xs font-semibold ${sc.homework.deadlineComplianceRate !== null ? scoreColor(sc.homework.deadlineComplianceRate) : "text-gray-400"}`}>
                  {sc.homework.deadlineComplianceRate !== null ? `${sc.homework.deadlineComplianceRate}%` : "—"}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 italic">Hali vazifa berilmagan</p>
        )}
      </div>

      {/* Activity card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">Faollik</p>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-xs text-gray-500">Sessiyalar soni</span>
          <span className="text-xs font-semibold text-gray-800">{sc.activity.count}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-xs text-gray-500">O&apos;rtacha ball</span>
          <span className={`text-xs font-semibold ${sc.activity.avgScore !== null ? scoreColor(sc.activity.avgScore) : "text-gray-400"}`}>
            {sc.activity.avgScore !== null ? `${sc.activity.avgScore}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupervisorPersonPage() {
  const params        = useParams<{ participantId: string }>();
  const participantId = params.participantId;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-lg mx-auto px-4 pt-5">
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Loader2 size={32} className="animate-spin text-indigo-500" />
            </div>
          }
        >
          <ScorecardDetail participantId={participantId} />
        </Suspense>
      </div>
    </div>
  );
}
