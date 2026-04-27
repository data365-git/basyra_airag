"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Edit, Trash2, KeyRound, ExternalLink, Send, RefreshCw, Unlink, Copy, Check, UserPlus, Eye } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { QRCodeDisplay } from "@/components/participants/QRCodeDisplay";
import { AttendanceBadge, TrainingStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/Modal";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { formatDate, getAttendanceColorClass } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";
import type { Participant } from "@/types";

type ParticipantDetail = Participant & {
  training_participants?: Array<{
    enrolled_at: string;
    training: {
      id: string;
      name: string;
      color?: string | null;
      icon?: string | null;
      start_date?: string;
      end_date?: string;
      status?: string;
      schedule_days?: number[];
    };
  }>;
};

type AttendanceStatusValue = "present" | "absent" | "late" | "excused";

type HistorySession = {
  id: string;
  session_number: number;
  session_date: string;
  status: string;
  record?: {
    status?: AttendanceStatusValue | null;
    note?: string | null;
  } | null;
};

type ParticipantHistoryItem = {
  trainingId: string;
  training: {
    name: string;
    color: string;
    status: "upcoming" | "active" | "completed";
  };
  sessions: HistorySession[];
};

type SupervisorLinkRow = {
  id: string;
  boss_id: string;
  boss_name: string;
  report_id: string;
  report_name: string;
  training_id: string | null;
  training_name?: string | null;
  created_at: string;
};

type ParticipantSearchResult = {
  id: string;
  full_name: string;
  phone: string | null;
  eligibility?: {
    mode: "supervisor" | "employee";
    eligible: boolean;
    reason: string | null;
  } | null;
  eligible?: boolean;
  is_eligible?: boolean;
  reason?: string | null;
  eligibility_reason?: string | null;
  ineligible_reason?: string | null;
};

type SupervisorPickerMode = "supervisor" | "watching";

export default function ParticipantProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const canManage = usePermission("participants", "edit");
  const canDelete = usePermission("participants", "delete");
  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);
  const [history, setHistory] = useState<ParticipantHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "activity">("overview");
  const [accessOpen, setAccessOpen] = useState(false);
  const [activityData, setActivityData] = useState<{
    count: number;
    avg_score: number | null;
    scores: Array<{
      session_date: string;
      session_number: number;
      training_name: string;
      training_color: string;
      score: number;
      note: string | null;
      entered_by: string | null;
    }>;
  } | null>(null);
  const [deleteOpen,      setDeleteOpen]      = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [unlinkTgOpen,    setUnlinkTgOpen]    = useState(false);
  const [deleteLoginOpen, setDeleteLoginOpen] = useState(false);
  const [supervisors,     setSupervisors]     = useState<SupervisorLinkRow[]>([]);
  const [watching,        setWatching]        = useState<SupervisorLinkRow[]>([]);
  const [supervisorQuery, setSupervisorQuery] = useState("");
  const [supervisorPickerOpen, setSupervisorPickerOpen] = useState(false);
  const [supervisorResults, setSupervisorResults] = useState<ParticipantSearchResult[]>([]);
  const [supervisorSearching, setSupervisorSearching] = useState(false);
  const [supervisorSearchError, setSupervisorSearchError] = useState<string | null>(null);
  const [addingSupervisorId, setAddingSupervisorId] = useState<string | null>(null);
  const [removingSupervisorId, setRemovingSupervisorId] = useState<string | null>(null);
  const [watchingQuery, setWatchingQuery] = useState("");
  const [watchingPickerOpen, setWatchingPickerOpen] = useState(false);
  const [watchingResults, setWatchingResults] = useState<ParticipantSearchResult[]>([]);
  const [watchingSearching, setWatchingSearching] = useState(false);
  const [watchingSearchError, setWatchingSearchError] = useState<string | null>(null);
  const [addingWatchingId, setAddingWatchingId] = useState<string | null>(null);
  const [removingWatchingId, setRemovingWatchingId] = useState<string | null>(null);

  // Portal login state
  interface AuthInfo { id: string; username: string; lastLoginAt: string | null; createdAt: string }
  const [authInfo, setAuthInfo]       = useState<AuthInfo | null | "none">("none");
  const [loginModal, setLoginModal]   = useState<"create" | "reset" | null>(null);
  const [loginForm, setLoginForm]     = useState({ username: "", password: "" });
  const [loginSaving, setLoginSaving] = useState(false);

  // Telegram state
  interface TelegramInfo {
    linked: boolean;
    chatId: string | null;
    username: string | null;
    firstName: string | null;
    linkedAt: string | null;
    pendingCode: string | null;
    codeExpiresAt: string | null;
  }
  const [tgInfo,        setTgInfo]        = useState<TelegramInfo | null>(null);
  const [tgCodeLoading, setTgCodeLoading] = useState(false);
  const [tgCopied,      setTgCopied]      = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/participants/${id}`).then((r) => r.json()),
      fetch(`/api/participants/${id}/history`).then((r) => r.json()),
      fetch(`/api/participants/${id}/auth`).then((r) => r.json()),
      fetch(`/api/participants/${id}/telegram`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/participants/${id}/activity`).then((r) => r.json()).catch(() => null),
      fetch(`/api/supervisor-links?reportId=${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/supervisor-links?bossId=${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : []),
    ]).then(([p, h, a, tg, act, supervisorRows, watchingRows]) => {
      setParticipant(p);
      setHistory(Array.isArray(h) ? h as ParticipantHistoryItem[] : []);
      setAuthInfo(a ?? null);
      setTgInfo(tg ?? null);
      setActivityData(act ?? null);
      setSupervisors(Array.isArray(supervisorRows) ? supervisorRows as SupervisorLinkRow[] : []);
      setWatching(Array.isArray(watchingRows) ? watchingRows as SupervisorLinkRow[] : []);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    const q = supervisorQuery.trim();
    if (q.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSupervisorSearching(true);
      setSupervisorSearchError(null);
      fetch(`/api/participants/search?q=${encodeURIComponent(q)}&eligible_supervisor_for=${encodeURIComponent(id)}`, { signal: controller.signal })
        .then(async (r) => {
          if (r.ok) return r.json();
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? "Could not search participants");
        })
        .then((rows) => {
          setSupervisorResults(Array.isArray(rows) ? rows as ParticipantSearchResult[] : []);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSupervisorResults([]);
          setSupervisorSearchError(err instanceof Error ? err.message : "Could not search participants");
        })
        .finally(() => setSupervisorSearching(false));
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [id, supervisorQuery]);

  useEffect(() => {
    const q = watchingQuery.trim();
    if (q.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setWatchingSearching(true);
      setWatchingSearchError(null);
      fetch(`/api/participants/search?q=${encodeURIComponent(q)}&eligible_employee_for=${encodeURIComponent(id)}`, { signal: controller.signal })
        .then(async (r) => {
          if (r.ok) return r.json();
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? "Could not search participants");
        })
        .then((rows) => {
          setWatchingResults(Array.isArray(rows) ? rows as ParticipantSearchResult[] : []);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setWatchingResults([]);
          setWatchingSearchError(err instanceof Error ? err.message : "Could not search participants");
        })
        .finally(() => setWatchingSearching(false));
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [id, watchingQuery]);

  async function handleGenerateTgCode() {
    setTgCodeLoading(true);
    const res = await fetch(`/api/participants/${id}/telegram`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setTgInfo((prev) => prev ? { ...prev, pendingCode: data.code, codeExpiresAt: data.expiresAt } : prev);
      toast.success("Kod yaratildi");
    } else {
      toast.error("Xato");
    }
    setTgCodeLoading(false);
  }

  async function handleUnlinkTelegram() {
    await fetch(`/api/participants/${id}/telegram`, { method: "DELETE" });
    setTgInfo((prev) => prev ? { ...prev, linked: false, chatId: null, username: null, firstName: null, linkedAt: null } : prev);
    setUnlinkTgOpen(false);
    toast.success("Telegram uzildi");
  }

  async function handleCreateLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginSaving(true);
    const res = await fetch(`/api/participants/${id}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginForm),
    });
    setLoginSaving(false);
    if (res.ok) {
      const data = await res.json();
      setAuthInfo(data);
      setLoginModal(null);
      toast.success("Login yaratildi");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Xatolik");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoginSaving(true);
    const res = await fetch(`/api/participants/${id}/auth`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: loginForm.password }),
    });
    setLoginSaving(false);
    if (res.ok) {
      setLoginModal(null);
      toast.success("Parol yangilandi");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Xatolik");
    }
  }

  async function handleDeleteLogin() {
    await fetch(`/api/participants/${id}/auth`, { method: "DELETE" });
    setAuthInfo(null);
    setDeleteLoginOpen(false);
    toast.success("Login o'chirildi");
  }

  async function handleAddSupervisor(candidate: ParticipantSearchResult) {
    const reason = getCandidateIneligibleReason(candidate, "supervisor");
    if (reason) {
      setSupervisorSearchError(reason);
      return;
    }

    setAddingSupervisorId(candidate.id);
    setSupervisorSearchError(null);
    const res = await fetch("/api/supervisor-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boss_id: candidate.id, report_id: id }),
    });
    setAddingSupervisorId(null);

    if (res.ok) {
      const row = await res.json();
      setSupervisors((current) => [row as SupervisorLinkRow, ...current]);
      setSupervisorQuery("");
      setSupervisorPickerOpen(false);
      setSupervisorResults([]);
      toast.success("Supervisor qo'shildi");
      return;
    }

    const err = await res.json().catch(() => ({}));
    setSupervisorSearchError(err.error ?? "Supervisor qo'shilmadi");
    toast.error(err.error ?? "Supervisor qo'shilmadi");
  }

  function handleSupervisorQueryChange(value: string) {
    setSupervisorQuery(value);
    setSupervisorSearchError(null);
    if (value.trim().length < 2) {
      setSupervisorResults([]);
      setSupervisorSearching(false);
    }
  }

  async function handleRemoveSupervisor(linkId: string) {
    setRemovingSupervisorId(linkId);
    const res = await fetch(`/api/supervisor-links/${linkId}`, { method: "DELETE" });
    setRemovingSupervisorId(null);

    if (res.ok) {
      setSupervisors((current) => current.filter((row) => row.id !== linkId));
      toast.success("Supervisor olib tashlandi");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Supervisor olib tashlanmadi");
    }
  }

  async function handleAddWatchedEmployee(candidate: ParticipantSearchResult) {
    const reason = getCandidateIneligibleReason(candidate, "watching");
    if (reason) {
      setWatchingSearchError(reason);
      return;
    }

    setAddingWatchingId(candidate.id);
    setWatchingSearchError(null);
    const res = await fetch("/api/supervisor-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boss_id: id, report_id: candidate.id }),
    });
    setAddingWatchingId(null);

    if (res.ok) {
      const row = await res.json();
      setWatching((current) => [row as SupervisorLinkRow, ...current]);
      setWatchingQuery("");
      setWatchingPickerOpen(false);
      setWatchingResults([]);
      toast.success("Employee added to watching");
      return;
    }

    const err = await res.json().catch(() => ({}));
    setWatchingSearchError(err.error ?? "Employee was not added");
    toast.error(err.error ?? "Employee was not added");
  }

  function handleWatchingQueryChange(value: string) {
    setWatchingQuery(value);
    setWatchingSearchError(null);
    if (value.trim().length < 2) {
      setWatchingResults([]);
      setWatchingSearching(false);
    }
  }

  async function handleRemoveWatching(linkId: string) {
    setRemovingWatchingId(linkId);
    const res = await fetch(`/api/supervisor-links/${linkId}`, { method: "DELETE" });
    setRemovingWatchingId(null);

    if (res.ok) {
      setWatching((current) => current.filter((row) => row.id !== linkId));
      toast.success("Employee removed from watching");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Employee was not removed");
    }
  }

  function getCandidateIneligibleReason(candidate: ParticipantSearchResult, mode: SupervisorPickerMode) {
    const apiEligible = candidate.eligible ?? candidate.is_eligible;
    const apiReason =
      candidate.eligibility?.reason ??
      candidate.ineligible_reason ??
      candidate.eligibility_reason ??
      candidate.reason ??
      null;

    if (candidate.eligibility?.eligible === false) return apiReason || "Not eligible for this role.";
    if (apiEligible === false) return apiReason || "Not eligible for this role.";
    if (apiReason) return apiReason;
    if (candidate.id === id) return "A participant cannot supervise or watch themselves.";

    if (mode === "supervisor" && supervisors.some((link) => link.boss_id === candidate.id)) {
      return "Already assigned as this participant's supervisor.";
    }

    if (mode === "watching" && watching.some((link) => link.report_id === candidate.id)) {
      return "Already in this participant's watching list.";
    }

    return null;
  }

  function getStats(sessions: HistorySession[]) {
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
  const hasLegacySupervisorXorViolation = supervisors.length > 0 && watching.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={participant.full_name}
        subtitle={participant.phone || participant.email || "Participant"}
        back
        backHref="/participants"
        actions={
          <>
            {canManage && (authInfo !== "none" || tgInfo !== null) && (
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAccessOpen((open) => !open)}
                >
                  <KeyRound size={14} /> Access <ChevronDown size={14} />
                </Button>

                {accessOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-2xl border border-gray-200 bg-white p-3 text-sm shadow-xl">
                    {authInfo !== "none" && (
                      <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-gray-900">Shaxsiy kabinet</p>
                          <a
                            href="/portal/login"
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <ExternalLink size={12} /> Portal
                          </a>
                        </div>

                        {authInfo === null ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setLoginForm({ username: "", password: "" });
                              setLoginModal("create");
                              setAccessOpen(false);
                            }}
                          >
                            Login yaratish
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-gray-500">Login</span>
                              <span className="font-mono font-medium">{authInfo.username}</span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs">
                              <button
                                onClick={() => {
                                  setLoginForm({ username: "", password: "" });
                                  setLoginModal("reset");
                                  setAccessOpen(false);
                                }}
                                className="text-gray-600 underline hover:text-gray-900"
                              >
                                Parolni yangilash
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteLoginOpen(true);
                                  setAccessOpen(false);
                                }}
                                className="text-red-500 underline hover:text-red-700"
                              >
                                O&apos;chirish
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {tgInfo !== null && (
                      <div className="mt-2 space-y-2 rounded-xl bg-blue-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-gray-900">Telegram</p>
                          <span className="text-xs text-gray-500">
                            {tgInfo.linked ? "Ulangan" : "Ulanmagan"}
                          </span>
                        </div>

                        {tgInfo.linked ? (
                          <>
                            <p className="text-xs text-gray-600">
                              {tgInfo.firstName ?? "Ulangan"}
                              {tgInfo.username && <span className="ml-1">@{tgInfo.username}</span>}
                            </p>
                            <button
                              onClick={() => {
                                setUnlinkTgOpen(true);
                                setAccessOpen(false);
                              }}
                              className="inline-flex items-center gap-1 text-xs text-red-500 underline hover:text-red-700"
                            >
                              <Unlink size={11} /> Telegram&apos;ni uzish
                            </button>
                          </>
                        ) : (
                          <>
                            {tgInfo.pendingCode && (() => {
                              const deepLink = `https://t.me/basyra_yordamchi_bot?start=${tgInfo.pendingCode}`;
                              return (
                                <div className="rounded-lg border border-blue-200 bg-white p-2">
                                  <p className="break-all font-mono text-xs text-blue-700">{deepLink}</p>
                                  <button
                                    onClick={() => {
                                      const msg =
                                        `Basyra o'quv markaziga xush kelibsiz!\n` +
                                        `Shaxsiy kabinetingizni ochish uchun quyidagi havolani bosing:\n` +
                                        deepLink;
                                      navigator.clipboard.writeText(msg);
                                      setTgCopied(true);
                                      setTimeout(() => setTgCopied(false), 2000);
                                    }}
                                    className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 underline hover:text-blue-800"
                                  >
                                    {tgCopied ? <Check size={12} /> : <Copy size={12} />} Xabarni nusxa olish
                                  </button>
                                </div>
                              );
                            })()}
                            <button
                              onClick={handleGenerateTgCode}
                              disabled={tgCodeLoading}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                            >
                              {tgCodeLoading
                                ? <RefreshCw size={12} className="animate-spin" />
                                : <Send size={12} />}
                              {tgInfo.pendingCode ? "Yangi kod yaratish" : "Telegram kodi yaratish"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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

      <div className="flex gap-1 border-b border-gray-100 mb-6">
        {(["overview", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "overview" ? t("common.overview") ?? "Overview" : "Activity"}
          </button>
        ))}
      </div>

      {hasLegacySupervisorXorViolation && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Legacy supervisor eligibility violation</p>
            <p className="mt-1 text-amber-800">
              This participant is both a supervisor and an employee. The new XOR rule prevents creating this state, but this existing data was left unchanged.
            </p>
          </div>
        </div>
      )}

      {activeTab === "overview" && (
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

        {/* Supervisors */}
        <Card>
          <CardTitle className="mb-4 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <UserPlus size={16} className="text-blue-600" /> Supervisors
            </span>
            {canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSupervisorPickerOpen((open) => !open)}
              >
                Add supervisor
              </Button>
            )}
          </CardTitle>

          <div className="space-y-3">
            {canManage && supervisorPickerOpen && (
              <div className="relative">
                <input
                  type="search"
                  autoFocus
                  value={supervisorQuery}
                  onChange={(event) => handleSupervisorQueryChange(event.target.value)}
                  placeholder="Add supervisor by name or phone..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Eligible supervisors cannot already be employees. Ineligible matches stay visible but disabled with the reason.
                </p>
                {supervisorSearchError && (
                  <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {supervisorSearchError}
                  </div>
                )}
                {supervisorQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                    {supervisorSearching ? (
                      <div className="px-3 py-3 text-sm text-gray-500">Searching...</div>
                    ) : supervisorResults.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-gray-500">
                        No eligible supervisor matches yet. Search for someone who is not already an employee.
                      </div>
                    ) : supervisorResults.map((candidate) => {
                      const reason = getCandidateIneligibleReason(candidate, "supervisor");
                      const disabled = Boolean(reason) || addingSupervisorId !== null;

                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => handleAddSupervisor(candidate)}
                          disabled={disabled}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                            reason
                              ? "cursor-not-allowed bg-gray-50 text-gray-400"
                              : "hover:bg-blue-50 disabled:opacity-60"
                          }`}
                        >
                          <span>
                            <span className={`block font-medium ${reason ? "text-gray-500" : "text-gray-900"}`}>{candidate.full_name}</span>
                            <span className="block text-xs text-gray-500">{candidate.phone || "No phone"}</span>
                            {reason && <span className="mt-1 block text-xs text-gray-400">{reason}</span>}
                          </span>
                          <span className={`text-xs font-semibold ${reason ? "text-gray-400" : "text-blue-600"}`}>
                            {reason ? "Unavailable" : addingSupervisorId === candidate.id ? "Adding..." : "Add"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {supervisors.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm">
                <p className="font-medium text-gray-800">No supervisors assigned</p>
                <p className="mt-1 text-gray-500">Add an existing participant so they can watch this participant directly.</p>
                {canManage && !supervisorPickerOpen && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSupervisorPickerOpen(true)}
                    className="mt-3"
                  >
                    Add supervisor
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {supervisors.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                    <Link href={`/participants/${link.boss_id}`} className="min-w-0 text-sm font-medium text-gray-900 hover:text-blue-600">
                      {link.boss_name}
                    </Link>
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={removingSupervisorId === link.id}
                        onClick={() => handleRemoveSupervisor(link.id)}
                        className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={13} /> Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-4 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Eye size={16} className="text-emerald-600" /> Watching
            </span>
            {canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWatchingPickerOpen((open) => !open)}
              >
                Add employee
              </Button>
            )}
          </CardTitle>

          <div className="space-y-3">
            {canManage && watchingPickerOpen && (
              <div className="relative">
                <input
                  type="search"
                  autoFocus
                  value={watchingQuery}
                  onChange={(event) => handleWatchingQueryChange(event.target.value)}
                  placeholder="Add employee by name or phone..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Eligible employees cannot already be supervisors. Ineligible matches stay visible but disabled with the reason.
                </p>
                {watchingSearchError && (
                  <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {watchingSearchError}
                  </div>
                )}
                {watchingQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                    {watchingSearching ? (
                      <div className="px-3 py-3 text-sm text-gray-500">Searching...</div>
                    ) : watchingResults.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-gray-500">
                        No eligible employee matches yet. Search for someone who is not already a supervisor.
                      </div>
                    ) : watchingResults.map((candidate) => {
                      const reason = getCandidateIneligibleReason(candidate, "watching");
                      const disabled = Boolean(reason) || addingWatchingId !== null;

                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => handleAddWatchedEmployee(candidate)}
                          disabled={disabled}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                            reason
                              ? "cursor-not-allowed bg-gray-50 text-gray-400"
                              : "hover:bg-emerald-50 disabled:opacity-60"
                          }`}
                        >
                          <span>
                            <span className={`block font-medium ${reason ? "text-gray-500" : "text-gray-900"}`}>{candidate.full_name}</span>
                            <span className="block text-xs text-gray-500">{candidate.phone || "No phone"}</span>
                            {reason && <span className="mt-1 block text-xs text-gray-400">{reason}</span>}
                          </span>
                          <span className={`text-xs font-semibold ${reason ? "text-gray-400" : "text-emerald-600"}`}>
                            {reason ? "Unavailable" : addingWatchingId === candidate.id ? "Adding..." : "Add"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {watching.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm">
                <p className="font-medium text-gray-800">Not watching any participants yet</p>
                <p className="mt-1 text-gray-500">Add an eligible employee so this participant can watch them directly.</p>
                {canManage && !watchingPickerOpen && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWatchingPickerOpen(true)}
                    className="mt-3"
                  >
                    Add employee
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {watching.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                    <Link href={`/participants/${link.report_id}`} className="min-w-0 text-sm font-medium text-gray-900 hover:text-emerald-600">
                      {link.report_name}
                    </Link>
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={removingWatchingId === link.id}
                        onClick={() => handleRemoveWatching(link.id)}
                        className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={13} /> Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
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
                    {t("participants.view_history", { n: String(item.sessions.length) })}
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
                        {item.sessions.length === 0 ? <EmptyRow cols={4} /> : item.sessions.map((row) => (
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
      )}

      {activeTab === "activity" && (
        <div className="space-y-4">
          {activityData && (
            <div className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
              <span>⚡</span>
              <span>
                <strong>{activityData.count}</strong> sessions scored
                {activityData.avg_score !== null && (
                  <> · Avg: <strong>{activityData.avg_score}%</strong></>
                )}
              </span>
            </div>
          )}
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Training</Th>
                <Th>Score</Th>
                <Th>Notes</Th>
                <Th>Entered by</Th>
              </Tr>
            </Thead>
            <Tbody>
              {!activityData ? (
                <EmptyRow cols={5} message="Loading..." />
              ) : activityData.scores.length === 0 ? (
                <EmptyRow cols={5} message="No activity scores recorded" />
              ) : (
                activityData.scores.map((s, i) => (
                  <Tr key={i}>
                    <Td>{s.session_date}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.training_color }} />
                        {s.training_name}
                      </span>
                    </Td>
                    <Td>
                      <span className={`font-semibold ${s.score >= 80 ? "text-green-600" : s.score >= 60 ? "text-amber-600" : "text-red-600"}`}>
                        {s.score}%
                      </span>
                    </Td>
                    <Td className="text-gray-500">{s.note ?? "—"}</Td>
                    <Td className="text-gray-500">{s.entered_by ?? "—"}</Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </div>
      )}

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        danger
        title={t("participants.delete_title")}
        message={t("participants.delete_message", { name: participant.full_name })}
        confirmLabel={deleting ? t("common.deleting") : t("common.delete")}
      />

      <ConfirmModal
        open={unlinkTgOpen}
        onClose={() => setUnlinkTgOpen(false)}
        onConfirm={handleUnlinkTelegram}
        danger
        title="Telegram'ni uzish"
        message={`${participant.full_name} uchun Telegram ulanishini uzmoqchimisiz? Ishtirokchi bot orqali xabar ola olmaydi.`}
        confirmLabel="Uzish"
      />

      <ConfirmModal
        open={deleteLoginOpen}
        onClose={() => setDeleteLoginOpen(false)}
        onConfirm={handleDeleteLogin}
        danger
        title="Portal loginni o'chirish"
        message={`${participant.full_name} uchun portal kirish ma'lumotlarini o'chirmoqchimisiz? Ishtirokchi portaga kira olmaydi.`}
        confirmLabel="O'chirish"
      />

      {/* Create login modal */}
      {loginModal === "create" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Login yaratish</h3>
            <form onSubmit={handleCreateLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Login (username)</label>
                <input
                  type="text"
                  required
                  value={loginForm.username}
                  onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                  placeholder="alisher.k"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Faqat lotin harflari, raqamlar, nuqta va chiziqcha</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vaqtinchalik parol</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Kamida 6 ta belgi"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLoginModal(null)}
                  className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-medium"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={loginSaving}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  {loginSaving ? "..." : "Yaratish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {loginModal === "reset" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Parolni yangilash</h3>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yangi parol</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Kamida 6 ta belgi"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLoginModal(null)}
                  className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-medium"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={loginSaving}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  {loginSaving ? "..." : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
