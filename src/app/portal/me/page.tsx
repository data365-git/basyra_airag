"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut, User, Loader2, BookOpen, CheckCircle2, Clock,
  ChevronDown, ChevronUp, AlertCircle, Star, Send, Calendar,
  Trash2, FileText, AlertTriangle, Link2, Video, Mic, Image, File, Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { fmtUzDateShort } from "@/lib/dateFormat";

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
    is_late:      boolean;
    late_by_days: number | null;
    file_count:   number;
    grade: { score: number; feedback: string | null } | null;
  } | null;
}

interface PortalMaterial {
  id:          string;
  kind:        "PDF" | "VIDEO" | "AUDIO" | "IMAGE" | "DOCUMENT" | "LINK";
  title:       string;
  description: string | null;
  storage_url: string | null;
  url:         string | null;
  file_size_bytes: number | null;
}

interface ScorecardData {
  attendance: {
    total: number; present: number; late: number;
    excused: number; absent: number; rate: number;
  };
  homework: {
    total: number; submitted: number; graded: number;
    avgScore: number | null; submitRate: number;
    deadlineComplianceRate: number | null;
    onTimeCount: number;
    deadlineEligibleCount: number;
  };
  activity: {
    count: number; avgScore: number | null;
  };
  overallScore:      number;
  attendanceHistory: AttendanceHistoryEntry[];
  homeworks:         HomeworkItem[];
}

// ─── Portal fetch helper ──────────────────────────────────────────────────────
// Attaches the JWT from localStorage as an Authorization header so requests
// work inside Telegram Mini App's webview, which drops httpOnly cookies.

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  if (v >= 80) return "#22C55E";
  if (v >= 60) return "#F59E0B";
  return "#EF4444";
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
          <p className="text-2xl font-bold">{sc.homework.deadlineComplianceRate ?? 0}%</p>
          <p className="text-xs opacity-60 mt-0.5">⏰ Muddatga rioya</p>
        </div>
      </div>
    </div>
  );
}

// ─── Homework card ────────────────────────────────────────────────────────────

function MatKindIcon({ kind }: { kind: PortalMaterial["kind"] }) {
  if (kind === "LINK")     return <Link2    size={13} className="text-blue-500 shrink-0" />;
  if (kind === "VIDEO")    return <Video    size={13} className="text-purple-500 shrink-0" />;
  if (kind === "AUDIO")    return <Mic      size={13} className="text-green-500 shrink-0" />;
  if (kind === "IMAGE")    return <Image    size={13} className="text-pink-500 shrink-0" />;
  if (kind === "PDF")      return <FileText size={13} className="text-red-500 shrink-0" />;
  return <File size={13} className="text-gray-400 shrink-0" />;
}

function HomeworkCard({
  hw, onUpdate,
}: {
  hw:       HomeworkItem;
  onUpdate: () => void;
}) {
  const [open,        setOpen]        = useState(false);
  const [cancelling,  setCancelling]  = useState(false);
  const [materials,   setMaterials]   = useState<PortalMaterial[] | null>(null);
  const [matLoading,  setMatLoading]  = useState(false);
  const [matError,    setMatError]    = useState(false);
  const [sending,     setSending]     = useState<string | null>(null); // materialId being sent

  const hasSubmitted = !!hw.submission;
  const hasGrade     = !!hw.submission?.grade;
  const isLate       = !!hw.submission?.is_late;

  async function loadMaterials() {
    if (materials !== null) return; // already fetched
    setMatLoading(true);
    setMatError(false);
    try {
      const res = await portalFetch(`/api/homeworks/${hw.id}/materials`);
      if (res.ok) setMaterials(await res.json());
      else { setMaterials([]); setMatError(true); }
    } catch {
      setMaterials([]); setMatError(true);
    } finally {
      setMatLoading(false);
    }
  }

  function toggle() {
    if (!open) loadMaterials();
    setOpen((o) => !o);
  }

  async function sendViaBot(materialId: string) {
    if (sending) return;
    setSending(materialId);
    try {
      const res  = await portalFetch(`/api/portal/materials/${materialId}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Telegram botga yuborildi 📨");
      } else {
        toast.error(data.error ?? "Yuborishda xatolik");
      }
    } catch {
      toast.error("Tarmoq xatosi");
    } finally {
      setSending(null);
    }
  }

  function openLink(url: string) {
    const twa = (window as any).Telegram?.WebApp;
    if (twa?.openLink) {
      twa.openLink(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function cancelSubmission() {
    if (!confirm("Topshiriqni bekor qilishni xohlaysizmi?")) return;
    setCancelling(true);
    try {
      const res = await portalFetch(`/api/portal/homeworks/${hw.id}/submission`, { method: "DELETE" });
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
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          hasGrade ? "bg-green-100" : isLate ? "bg-amber-100" : hasSubmitted ? "bg-blue-100" : "bg-gray-100"
        }`}>
          {hasGrade
            ? <Star size={15} className="text-green-600" />
            : isLate
            ? <AlertTriangle size={15} className="text-amber-500" />
            : hasSubmitted
            ? <CheckCircle2 size={15} className="text-blue-600" />
            : <Clock size={15} className="text-gray-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{hw.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {hw.due_date && (
              <p className="text-xs text-gray-400">Muddat: {fmtUzDateShort(hw.due_date)}</p>
            )}
            {hasGrade && (
              <span className="text-xs text-green-600 font-semibold">
                ✓ {hw.submission!.grade!.score}/{hw.max_score}
              </span>
            )}
            {isLate && (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-0.5">
                <AlertTriangle size={10} />
                {hw.submission!.late_by_days != null ? `${hw.submission!.late_by_days} kun kech` : "Kechikkan"}
              </span>
            )}
            {hasSubmitted && !hasGrade && !isLate && (
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
                  Topshirildi · {fmtUzDateShort(hw.submission!.submitted_at.slice(0, 10))}
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

          {/* Materials */}
          {matLoading && (
            <div className="flex justify-center py-2">
              <Loader2 size={14} className="animate-spin text-gray-400" />
            </div>
          )}
          {!matLoading && matError && (
            <p className="text-xs text-red-400 px-1">Materiallarni yuklashda xatolik</p>
          )}
          {!matLoading && !matError && materials && materials.length === 0 && (
            <p className="text-xs text-gray-400 italic px-1">Materiallar qo&apos;shilmagan</p>
          )}
          {!matLoading && materials && materials.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500">O&apos;quv materiallari</p>
              {materials.map((m) => {
                const fileHref = m.storage_url ?? null;
                const linkHref = m.url ?? null;

                // ── Inline audio player ──────────────────────────────────
                if (m.kind === "AUDIO" && fileHref) {
                  return (
                    <div key={m.id} className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <MatKindIcon kind={m.kind} />
                        <span className="text-xs text-gray-700 font-medium truncate flex-1">{m.title}</span>
                        {m.file_size_bytes && (
                          <span className="text-xs text-gray-400 shrink-0">
                            {(m.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        )}
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio
                        controls
                        src={fileHref}
                        className="w-full h-8"
                        style={{ colorScheme: "light" }}
                      />
                    </div>
                  );
                }

                // ── File — send via bot ───────────────────────────────────
                if (fileHref) {
                  const isSending = sending === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => sendViaBot(m.id)}
                      disabled={!!sending}
                      className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      <MatKindIcon kind={m.kind} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 font-medium truncate">{m.title}</p>
                        {m.file_size_bytes && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {(m.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-blue-600">
                        {isSending
                          ? <Loader2 size={11} className="animate-spin" />
                          : "📨"
                        }
                        {isSending ? "Yuklanmoqda…" : "Botga yuborish"}
                      </span>
                    </button>
                  );
                }

                // ── External link ─────────────────────────────────────────
                if (linkHref) {
                  return (
                    <div key={m.id} className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl">
                      <MatKindIcon kind={m.kind} />
                      <span className="text-xs text-gray-700 font-medium truncate flex-1">{m.title}</span>
                      <button
                        onClick={() => openLink(linkHref)}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      >
                        Ochish
                      </button>
                    </div>
                  );
                }

                // ── No URL available ──────────────────────────────────────
                return (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl opacity-50">
                    <MatKindIcon kind={m.kind} />
                    <span className="text-xs text-gray-700 truncate flex-1">{m.title}</span>
                  </div>
                );
              })}
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
                      {h.session_number}-dars · {fmtUzDateShort(h.date)}
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
      const res = await portalFetch(`/api/portal/scorecard/${training.id}`);
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

  const attColor   = scoreColor(sc.attendance.rate);
  const hwPct      = sc.homework.avgScore ?? 0;
  const deadlinePct = sc.homework.deadlineComplianceRate;

  return (
    <div className="space-y-4">

      {/* ── FIFA card ─────────────────────────────────────────────────────── */}
      <FifaCard name={name} training={training} sc={sc} />

      {/* ── Coach's feedback — secondary, muted, non-competitive ──────────── */}
      {sc.activity.count > 0 && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <div>
              <p className="text-xs font-semibold text-gray-600">Murabbiy bahosi</p>
              <p className="text-xs text-gray-400 mt-0.5">Bu baho umumiy ballingizga ta&apos;sir qilmaydi</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-gray-700">
              {sc.activity.avgScore !== null ? `${sc.activity.avgScore}%` : "—"}
            </p>
            <p className="text-xs text-gray-400">{sc.activity.count} dars</p>
          </div>
        </div>
      )}

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
            {deadlinePct !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 text-xs">Muddatga rioya</span>
                <span className="font-semibold text-gray-800 text-xs">
                  {deadlinePct}%
                  <span className="text-gray-400 text-xs ml-1">
                    ({sc.homework.onTimeCount}/{sc.homework.deadlineEligibleCount})
                  </span>
                </span>
              </div>
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
  const [hasTeam,         setHasTeam]         = useState(false);

  useEffect(() => {
    // ── Ensure TelegramLink is synced when inside Mini App ────────────────────
    // Fire-and-forget: if we're inside Telegram WebApp, upsert the TelegramLink
    // for the authenticated participant using the verified initData. This fixes
    // "Telegram akkauntingiz ulanmagan" when a user's TelegramLink was deleted
    // while their 30-day portal JWT remained valid.
    function syncTelegramLink(portalToken?: string | null) {
      const twa = (window as any).Telegram?.WebApp;
      if (!twa?.initData) return;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = portalToken ?? localStorage.getItem("portal_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch("/api/portal/ensure-telegram-link", {
        method:  "POST",
        headers,
        body:    JSON.stringify({ initData: twa.initData }),
      }).catch(() => {}); // non-critical — never block on this
    }

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
          // Persist JWT for Authorization-header auth (Telegram Mini App)
          const loginData = await tokenRes.json().catch(() => ({}));
          if (loginData.token) localStorage.setItem("portal_token", loginData.token);
          // Cookie also set — remove token from URL so refresh doesn't reuse it
          window.history.replaceState({}, "", "/portal/me");
          // Sync TelegramLink now that we have the portal JWT
          syncTelegramLink(loginData.token ?? null);
        } catch {
          router.replace("/portal/login");
          return;
        }
      }

      const r = await portalFetch("/api/portal/me");

      if (r.status !== 401) {
        const data = await r.json().catch(() => null);
        if (data) {
          setMe(data);
          if (data.trainings?.length > 0) setSelectedTraining(data.trainings[0].id);
        }

        // ── Mini App token refresh ───────────────────────────────────────────
        // If the /me succeeded via cookie but no localStorage token exists, we
        // are running inside a Telegram Mini App whose cross-origin webview will
        // drop the httpOnly cookie on subsequent fetches (e.g. /api/homeworks/:id/materials).
        // Silently re-authenticate to get and store the Bearer token so all later
        // portalFetch() calls include the Authorization header.
        const twaEarly = (window as any).Telegram?.WebApp;
        if (twaEarly && !localStorage.getItem("portal_token")) {
          try {
            const authRes = await fetch("/api/portal/telegram-miniapp-login", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ initData: twaEarly.initData ?? "" }),
            });
            if (authRes.ok) {
              const authData = await authRes.json().catch(() => ({}));
              if (authData.token) localStorage.setItem("portal_token", authData.token);
            }
          } catch { /* non-fatal — cookie will still work for this session */ }
        }

        // Sync TelegramLink — ensures "Botga yuborish" works even if the link
        // was deleted while the portal JWT was still valid.
        syncTelegramLink();

        // Check if user has a team (non-blocking)
        portalFetch("/api/portal/team")
          .then((r) => r.ok ? r.json() : [])
          .then((data: unknown[]) => setHasTeam(data.length > 0))
          .catch(() => {});

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
            // Persist JWT for Authorization-header auth
            const authData = await authRes.json().catch(() => ({}));
            if (authData.token) localStorage.setItem("portal_token", authData.token);
            // Cookie also set — retry the /me request
            const r2 = await portalFetch("/api/portal/me");
            const data = await r2.json().catch(() => null);
            if (data) {
              setMe(data);
              if (data.trainings?.length > 0) setSelectedTraining(data.trainings[0].id);
              // Sync TelegramLink after successful mini-app login
              syncTelegramLink(authData.token ?? null);
              portalFetch("/api/portal/team")
                .then((r) => r.ok ? r.json() : [])
                .then((td: unknown[]) => setHasTeam(td.length > 0))
                .catch(() => {});
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
    localStorage.removeItem("portal_token");
    await portalFetch("/api/portal/logout", { method: "POST" });
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

        {/* My team button — only shown if the user is a boss */}
        {hasTeam && (
          <div className="pt-2">
            <a
              href="/portal/team"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-blue-50 border border-blue-100 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Users size={16} />
              Mening jamoam
            </a>
          </div>
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
