"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut, User, Loader2, BookOpen, CheckCircle2, Clock,
  ChevronDown, ChevronUp, AlertCircle, Star, Send, Calendar,
  Trash2, FileText,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalMe {
  id:        string;
  name:      string;
  username:  string;
  trainings: Array<{ id: string; name: string; color: string; status: string }>;
}

interface AttendanceHistoryEntry {
  date:           string;
  session_number: number;
  status:         string;
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
    file_count:   number;
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
  activity: {
    count: number; avgScore: number | null;
  };
  overallScore:      number;
  attendanceHistory: AttendanceHistoryEntry[];
  homeworks:         HomeworkItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  if (v >= 80) return "#22C55E";
  if (v >= 60) return "#F59E0B";
  return "#EF4444";
}

/** "2026-04-15" → "15 Apr" */
function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
}

function statusLabel(s: string): { label: string; cls: string } {
  if (s === "present")  return { label: "Keldi",   cls: "text-green-600 bg-green-50" };
  if (s === "late")     return { label: "Kech",    cls: "text-amber-600 bg-amber-50" };
  if (s === "excused")  return { label: "Sababli", cls: "text-blue-500  bg-blue-50"  };
  return                       { label: "Kelmadi", cls: "text-red-500   bg-red-50"   };
}

function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-white/20 rounded-full h-1.5">
      <div
        className="h-1.5 rounded-full transition-all duration-700"
        style={{ width: `${Math.min(value, 100)}%`, background: color ?? "white" }}
      />
    </div>
  );
}

// ─── FIFA-style top card ──────────────────────────────────────────────────────

function FifaCard({
  name, training, sc,
}: {
  name:     string;
  training: PortalMe["trainings"][0];
  sc:       ScorecardData;
}) {
  const color = training.color || "#3B82F6";
  return (
    <div
      className="rounded-3xl p-5 text-white relative overflow-hidden shadow-lg"
      style={{ background: `linear-gradient(135deg, ${color}ff 0%, ${color}99 100%)` }}
    >
      {/* Decorative circle */}
      <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

      {/* Name row */}
      <div className="flex items-center gap-3 mb-5 relative">
        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-black shrink-0 backdrop-blur-sm">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-base leading-tight truncate">{name}</p>
          <p className="text-xs opacity-70 mt-0.5 truncate">{training.name}</p>
        </div>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/15 shrink-0">
          {training.status === "active" ? "Aktiv" : training.status === "upcoming" ? "Kutilmoqda" : "Tugagan"}
        </span>
      </div>

      {/* Big score */}
      <div className="text-center my-4 relative">
        <p className="text-7xl font-black leading-none" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          {sc.overallScore}
        </p>
        <p className="text-sm opacity-60 mt-2 uppercase tracking-widest font-semibold">Umumiy ball</p>
      </div>

      {/* Three stats */}
      <div className="grid grid-cols-3 gap-0 mt-4 border-t border-white/20 pt-4 relative">
        <div className="text-center">
          <p className="text-2xl font-bold">{sc.attendance.rate}%</p>
          <p className="text-xs opacity-60 mt-0.5">📅 Davomat</p>
        </div>
        <div className="text-center border-x border-white/20">
          <p className="text-2xl font-bold">{sc.homework.avgScore ?? 0}%</p>
          <p className="text-xs opacity-60 mt-0.5">📝 Vazifa</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{sc.activity.avgScore ?? 0}%</p>
          <p className="text-xs opacity-60 mt-0.5">⚡ Faollik</p>
        </div>
      </div>
    </div>
  );
}

// ─── Homework card ────────────────────────────────────────────────────────────

function HomeworkCard({
  hw, onUpdate,
}: {
  hw:       HomeworkItem;
  onUpdate: () => void;
}) {
  const [open,      setOpen]      = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const hasSubmitted = !!hw.submission;
  const hasGrade     = !!hw.submission?.grade;

  async function cancelSubmission() {
    if (!confirm("Topshiriqni bekor qilishni xohlaysizmi?")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/portal/homeworks/${hw.id}/submission`, { method: "DELETE" });
      if (res.ok) {
        onUpdate();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Xatolik yuz berdi");
      }
    } finally {
      setCancelling(false);
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
          <div className="flex items-center gap-2 mt-0.5">
            {hw.due_date && (
              <p className="text-xs text-gray-400">Muddat: {formatDate(hw.due_date)}</p>
            )}
            {hasGrade && (
              <span className="text-xs text-green-600 font-semibold">
                ✓ {hw.submission!.grade!.score}/{hw.max_score}
              </span>
            )}
            {hasSubmitted && !hasGrade && (
              <span className="text-xs text-blue-500 font-medium">Topshirildi</span>
            )}
          </div>
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
                  {hw.submission!.grade!.score}/{hw.max_score}
                </span>
              </div>
              {hw.submission!.grade!.feedback && (
                <p className="text-xs text-green-700 leading-relaxed">{hw.submission!.grade!.feedback}</p>
              )}
            </div>
          )}

          {/* Submitted — show file count + optional cancel */}
          {hasSubmitted && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 font-medium">
                  Topshirildi · {formatDate(hw.submission!.submitted_at.slice(0, 10))}
                </p>
              </div>
              {hw.submission!.file_count > 0 && (
                <div className="flex items-center gap-1.5">
                  <FileText size={12} className="text-blue-400" />
                  <p className="text-xs text-blue-600">{hw.submission!.file_count} ta fayl</p>
                </div>
              )}
              {!hasGrade && (
                <button
                  onClick={cancelSubmission}
                  disabled={cancelling}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors mt-1 disabled:opacity-50"
                >
                  {cancelling
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Trash2 size={11} />
                  }
                  Bekor qilish
                </button>
              )}
            </div>
          )}

          {/* Not submitted yet — show bot instruction */}
          {!hasSubmitted && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-3 flex items-start gap-2.5">
              <Send size={14} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-snug">
                Vazifani topshirish uchun Telegram botga fayl yuboring.
                Bot menyusidan <b>/homework</b> ni tanlang.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Attendance card with history ────────────────────────────────────────────

function AttendanceCard({ sc, attColor }: { sc: ScorecardData; attColor: string }) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">Davomat</p>
        </div>
        <span
          className="text-sm font-bold px-2.5 py-0.5 rounded-full"
          style={{ background: `${attColor}22`, color: attColor }}
        >
          {sc.attendance.rate}%
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${sc.attendance.rate}%`, background: attColor }}
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

      {/* History toggle */}
      {sc.attendanceHistory.length > 0 && (
        <>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full justify-center pt-1"
          >
            {showHistory
              ? <><ChevronUp size={13} /> So&apos;nggi darslarni yashirish</>
              : <><ChevronDown size={13} /> So&apos;nggi darslar</>
            }
          </button>

          {showHistory && (
            <div className="space-y-1.5 pt-1">
              {sc.attendanceHistory.map((h) => {
                const { label, cls } = statusLabel(h.status);
                return (
                  <div key={`${h.date}-${h.session_number}`}
                    className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-gray-50">
                    <span className="text-gray-500">
                      {h.session_number}-dars · {formatDate(h.date)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
                      {label}
                    </span>
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

// ─── Scorecard section for one training ──────────────────────────────────────

function TrainingScorecard({
  name, training,
}: {
  name:     string;
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

  const attColor = scoreColor(sc.attendance.rate);
  const hwPct    = sc.homework.avgScore ?? 0;

  return (
    <div className="space-y-4">

      {/* ── FIFA card ─────────────────────────────────────────────────────── */}
      <FifaCard name={name} training={training} sc={sc} />

      {/* ── Attendance detail (always shown) ──────────────────────────────── */}
      <AttendanceCard sc={sc} attColor={attColor} />

      {/* ── Homework detail (always shown) ────────────────────────────────── */}
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
            {sc.homework.avgScore !== null && (
              <p className="text-xs text-gray-500">
                O&apos;rtacha baho:{" "}
                <span className="font-semibold text-gray-800">{hwPct}%</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400 italic">Hali vazifa berilmagan</p>
        )}
      </div>

      {/* ── Homework list ──────────────────────────────────────────────────── */}
      {sc.homeworks.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-600 px-1">Vazifalar ro&apos;yxati</p>
          {sc.homeworks.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              onUpdate={load}
            />
          ))}
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
    async function init() {
      // ── Phone token login (from bot /login flow) ────────────────────────
      // Check ?token= before anything else so the cookie is set on first load.
      const urlParams = new URLSearchParams(window.location.search);
      const phoneToken = urlParams.get("token");
      if (phoneToken) {
        try {
          const tokenRes = await fetch("/api/portal/phone-token-login", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token: phoneToken }),
          });
          if (!tokenRes.ok) {
            // Token invalid or expired — go to login with error hint
            router.replace("/portal/login");
            return;
          }
          // Cookie set — remove token from URL so refresh doesn't reuse it
          window.history.replaceState({}, "", "/portal/me");
        } catch {
          router.replace("/portal/login");
          return;
        }
      }

      const r = await fetch("/api/portal/me");

      if (r.status !== 401) {
        const data = await r.json().catch(() => null);
        if (data) {
          setMe(data);
          if (data.trainings?.length > 0) setSelectedTraining(data.trainings[0].id);
        }
        setLoading(false);
        return;
      }

      // 401 — try Telegram Mini App auto-login before redirecting.
      // Detect by WebApp presence, NOT by initData truthiness — initData can
      // legitimately be an empty string on some open paths.
      const twa = (window as any).Telegram?.WebApp;
      if (twa) {
        try {
          twa.ready?.();
          twa.expand?.();
          const authRes = await fetch("/api/portal/telegram-miniapp-login", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ initData: twa.initData ?? "" }),
          });
          if (authRes.ok) {
            // Cookie set — retry the /me request
            const r2 = await fetch("/api/portal/me");
            const data = await r2.json().catch(() => null);
            if (data) {
              setMe(data);
              if (data.trainings?.length > 0) setSelectedTraining(data.trainings[0].id);
              setLoading(false);
              return;
            }
          }
        } catch { /* fall through to redirect */ }
      }

      router.replace("/portal/login");
      setLoading(false);
    }

    init();
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
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
            <User size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">{me.name}</p>
            <p className="text-xs text-gray-400 leading-tight">@{me.username}</p>
          </div>
        </div>
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
          <TrainingScorecard
            name={me.name}
            training={activeTraining}
            participantId={me.id}
          />
        )}

        {/* Logout — placed at bottom to avoid accidental taps */}
        <div className="pt-4 pb-2 flex justify-center">
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-red-400 transition-colors px-4 py-2 rounded-lg"
          >
            <LogOut size={13} />
            Tizimdan chiqish
          </button>
        </div>
      </div>
    </div>
  );
}
