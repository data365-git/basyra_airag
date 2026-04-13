"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut, User, Loader2, BookOpen, CheckCircle2, Clock,
  ChevronDown, ChevronUp, Send, AlertCircle, Star,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalMe {
  id:        string;
  name:      string;
  username:  string;
  trainings: Array<{ id: string; name: string; color: string; status: string }>;
}

interface HomeworkItem {
  id:          string;
  title:       string;
  description: string | null;
  due_date:    string | null;
  max_score:   number;
  submission: {
    id:           string;
    text:         string | null;
    submitted_at: string;
    grade: { score: number; feedback: string | null } | null;
  } | null;
}

interface ScorecardData {
  attendance: {
    total: number; present: number; late: number;
    excused: number; absent: number; rate: number;
  };
  homework: {
    total: number; submitted: number; graded: number;
    avgScore: number | null; submitRate: number;
  };
  overallScore: number;
  homeworks:    HomeworkItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ScoreRing({ value, size = 80, color = "#3B82F6" }: { value: number; size?: number; color?: string }) {
  const r   = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "present"  ? "bg-green-500" :
    status === "late"     ? "bg-amber-500" :
    status === "excused"  ? "bg-blue-400"  :
    "bg-gray-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}

function scoreColor(v: number) {
  if (v >= 80) return "#22C55E";
  if (v >= 60) return "#F59E0B";
  return "#EF4444";
}

// ─── Homework card ────────────────────────────────────────────────────────────

function HomeworkCard({
  hw, trainingId, participantId, onUpdate,
}: {
  hw: HomeworkItem;
  trainingId: string;
  participantId: string;
  onUpdate: () => void;
}) {
  const [open,        setOpen]        = useState(false);
  const [text,        setText]        = useState(hw.submission?.text ?? "");
  const [submitting,  setSubmitting]  = useState(false);

  const hasSubmitted = !!hw.submission;
  const hasGrade     = !!hw.submission?.grade;

  async function submit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/homeworks/${hw.id}/submissions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      toast.success("Topshirildi!");
      onUpdate();
    } catch {
      toast.error("Xato yuz berdi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          hasGrade ? "bg-green-100" : hasSubmitted ? "bg-blue-100" : "bg-gray-100"
        }`}>
          {hasGrade
            ? <Star size={15} className="text-green-600" />
            : hasSubmitted
            ? <CheckCircle2 size={15} className="text-blue-600" />
            : <Clock size={15} className="text-gray-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{hw.title}</p>
          {hw.due_date && (
            <p className="text-xs text-gray-400 mt-0.5">
              Muddat: {hw.due_date}
              {hasGrade && (
                <span className="ml-2 text-green-600 font-medium">
                  {hw.submission!.grade!.score}/{hw.max_score}
                </span>
              )}
            </p>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400 shrink-0" /> : <ChevronDown size={15} className="text-gray-400 shrink-0" />}
      </button>

      {/* Expanded */}
      {open && (
        <div className="px-4 pb-4 border-t border-gray-50 space-y-3 pt-3">
          {hw.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{hw.description}</p>
          )}

          {/* Grade block */}
          {hasGrade && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-green-800">Baho</span>
                <span className="text-sm font-bold text-green-700">
                  {hw.submission!.grade!.score} / {hw.max_score}
                </span>
              </div>
              {hw.submission!.grade!.feedback && (
                <p className="text-xs text-green-700 leading-relaxed">{hw.submission!.grade!.feedback}</p>
              )}
            </div>
          )}

          {/* Submission area */}
          {!hasGrade && (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={hasSubmitted ? "Javobingizni yangilang..." : "Javobingizni yozing..."}
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
              <button
                onClick={submit}
                disabled={submitting || !text.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {hasSubmitted ? "Yangilash" : "Topshirish"}
              </button>
            </div>
          )}

          {hasSubmitted && !hasGrade && hw.submission!.text && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs text-blue-700 font-semibold mb-1">Topshirilgan javob</p>
              <p className="text-xs text-blue-800 leading-relaxed">{hw.submission!.text}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Scorecard section for one training ──────────────────────────────────────

function TrainingScorecard({
  training, participantId,
}: {
  training: PortalMe["trainings"][0];
  participantId: string;
}) {
  const [sc,      setSc]      = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/scorecard/${training.id}`);
      if (res.ok) setSc(await res.json());
    } finally {
      setLoading(false);
    }
  }, [training.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={24} className="animate-spin text-blue-400" />
      </div>
    );
  }
  if (!sc) return null;

  const color = training.color || "#3B82F6";

  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-5">
          <div className="relative">
            <ScoreRing value={sc.overallScore} size={88} color={scoreColor(sc.overallScore)} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-gray-900">{sc.overallScore}</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-500 mb-1">Umumiy ball</p>
            <p className="text-2xl font-bold text-gray-900">{sc.overallScore}%</p>
            <p className="text-xs text-gray-400 mt-0.5">70% davomat · 30% vazifalar</p>
          </div>
        </div>
      </div>

      {/* Attendance */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Davomat</p>
          <span
            className="text-sm font-bold px-2.5 py-0.5 rounded-full"
            style={{ background: `${scoreColor(sc.attendance.rate)}22`, color: scoreColor(sc.attendance.rate) }}
          >
            {sc.attendance.rate}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${sc.attendance.rate}%`, background: scoreColor(sc.attendance.rate) }}
          />
        </div>
        <div className="grid grid-cols-4 gap-2 pt-1">
          {[
            { label: "Keldi",    value: sc.attendance.present, color: "text-green-600" },
            { label: "Kech",     value: sc.attendance.late,    color: "text-amber-600" },
            { label: "Sababli",  value: sc.attendance.excused, color: "text-blue-500"  },
            { label: "Kelmadi",  value: sc.attendance.absent,  color: "text-red-500"   },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
              <p className="text-xs text-gray-400">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center">
          Jami {sc.attendance.total} dars
        </p>
      </div>

      {/* Homework summary */}
      {sc.homework.total > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Vazifalar</p>
            <span className="text-xs text-gray-400">
              {sc.homework.submitted}/{sc.homework.total} topshirildi
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all"
              style={{ width: `${sc.homework.submitRate}%` }}
            />
          </div>
          {sc.homework.avgScore !== null && (
            <p className="text-xs text-gray-500">
              O'rtacha baho: <span className="font-semibold text-gray-800">{sc.homework.avgScore}%</span>
            </p>
          )}
        </div>
      )}

      {/* Homework list */}
      {sc.homeworks.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-600 px-1">Vazifalar ro'yxati</p>
          {sc.homeworks.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              trainingId={training.id}
              participantId={participantId}
              onUpdate={load}
            />
          ))}
        </div>
      )}

      {sc.homework.total === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-400">
          <BookOpen size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Hali vazifa yo'q</p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortalMePage() {
  const router = useRouter();
  const [me,              setMe]              = useState<PortalMe | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [selectedTraining, setSelectedTraining] = useState<string>("");

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => {
        if (r.status === 401) { router.replace("/portal/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setMe(data);
        if (data.trainings?.length > 0) setSelectedTraining(data.trainings[0].id);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await fetch("/api/portal/logout", { method: "POST" });
    toast.success("Chiqildi");
    router.push("/portal/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!me) return null;

  const activeTraining = me.trainings.find((t) => t.id === selectedTraining) ?? me.trainings[0];

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
            <User size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">{me.name}</p>
            <p className="text-xs text-gray-400 leading-tight">@{me.username}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
        >
          <LogOut size={15} />
          Chiqish
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        {/* Training tabs (if multiple) */}
        {me.trainings.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            {me.trainings.map((tr) => (
              <button
                key={tr.id}
                onClick={() => setSelectedTraining(tr.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  selectedTraining === tr.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {tr.name}
              </button>
            ))}
          </div>
        )}

        {me.trainings.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
            <AlertCircle size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-600">Siz hech qanday kursga yozilmagansiz</p>
          </div>
        )}

        {activeTraining && (
          <>
            {/* Training header */}
            <div
              className="rounded-2xl p-4 text-white"
              style={{ background: activeTraining.color || "#3B82F6" }}
            >
              <p className="text-xs font-semibold opacity-70 uppercase tracking-wider">Kurs</p>
              <p className="text-lg font-bold mt-0.5 leading-snug">{activeTraining.name}</p>
              <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full ${
                activeTraining.status === "active"   ? "bg-white/20 text-white" :
                activeTraining.status === "upcoming" ? "bg-white/20 text-white" :
                "bg-black/20 text-white/70"
              }`}>
                {activeTraining.status === "active"    ? "Aktiv" :
                 activeTraining.status === "upcoming"  ? "Kutilmoqda" :
                 "Tugagan"}
              </span>
            </div>

            <TrainingScorecard
              training={activeTraining}
              participantId={me.id}
            />
          </>
        )}
      </div>
    </div>
  );
}
