"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import {
  HomeworkAcceptingBadge,
  getHomeworkAcceptingHint,
  getHomeworkAcceptingState,
} from "@/components/homework/HomeworkAcceptingStatus";
import { usePermission } from "@/hooks/usePermission";
import { CheckCircle2, Clock, Star, Loader2, FileText, Mic, Video, Image as ImageIcon, File, Pencil, AlertTriangle, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { fmtUzDate, fmtUzDateTime } from "@/lib/dateFormat";
import { SubmissionTimeline } from "@/components/homework/SubmissionTimeline";
import { MaterialsPanel, type Material } from "@/components/homework/MaterialsPanel";
import { useTranslation } from "@/providers/LanguageProvider";

interface SubmissionFile {
  id:               string;
  file_name:        string;
  file_type:        string;
  file_size_bytes:  number | null;
  storage_url:      string | null;
  telegram_file_id: string | null;
}

interface Submission {
  id:           string;
  participant:  { id: string; full_name: string };
  text:         string | null;
  submitted_at: string;
  is_late:      boolean;
  late_by_days: number | null;
  grade:        { score: number; feedback: string | null; graded_at: string } | null;
  files:        SubmissionFile[];
}


function TimelinesssBadge({ isLate, lateByDays }: { isLate: boolean; lateByDays: number | null }) {
  const { t } = useTranslation();

  if (isLate) {
    const days = lateByDays ?? 1;
    return (
      <Badge variant="orange">
        {t("homework.timeliness.late").replace("{n}", String(days))}
      </Badge>
    );
  }

  if (lateByDays === 0) {
    return <Badge variant="yellow">{t("homework.timeliness.same_day")}</Badge>;
  }

  if (lateByDays != null && lateByDays < 0) {
    return (
      <Badge variant="green">
        {t("homework.timeliness.early").replace("{n}", String(Math.abs(lateByDays)))}
      </Badge>
    );
  }

  return <Badge variant="green">{t("homework.timeliness.on_time")}</Badge>;
}

function FileIcon({ type }: { type: string }) {
  if (type === "photo")    return <ImageIcon size={13} className="text-blue-400 shrink-0" />;
  if (type === "video")    return <Video    size={13} className="text-purple-400 shrink-0" />;
  if (type === "audio" || type === "voice") return <Mic size={13} className="text-green-400 shrink-0" />;
  if (type === "document") return <FileText size={13} className="text-orange-400 shrink-0" />;
  return <File size={13} className="text-gray-400 shrink-0" />;
}

function FileList({
  files,
  canManage,
  hwId,
  submissionId,
  onDeleted,
}: {
  files: SubmissionFile[];
  canManage: boolean;
  hwId: string;
  submissionId: string;
  onDeleted: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (files.length === 0) return null;

  async function deleteFile(file: SubmissionFile) {
    if (deletingId) return;
    if (!confirm(`"${file.file_name}" faylini o'chirishni tasdiqlaysizmi?`)) return;

    setDeletingId(file.id);
    const res = await fetch(`/api/homeworks/${hwId}/submissions/${submissionId}/files/${file.id}`, {
      method: "DELETE",
    });
    setDeletingId(null);

    if (res.ok) {
      toast.success("Fayl o'chirildi");
      onDeleted();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Faylni o'chirib bo'lmadi");
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {files.map((f) => {
        // Prefer download proxy — works for both R2-uploaded and Telegram-only files
        const href = (f.storage_url || f.telegram_file_id)
          ? `/api/homework-files/${f.id}/download`
          : null;
        const chip = href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs rounded-lg transition-colors"
          >
            <FileIcon type={f.file_type} />
            <span className="max-w-[120px] truncate">{f.file_name}</span>
            {f.file_size_bytes && <span className="text-blue-400">{Math.round(f.file_size_bytes / 1024)}KB</span>}
          </a>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-500 text-xs rounded-lg"
            title="Fayl mavjud emas"
          >
            <FileIcon type={f.file_type} />
            <span className="max-w-[120px] truncate">{f.file_name}</span>
            {f.file_size_bytes && <span className="text-gray-400">{Math.round(f.file_size_bytes / 1024)}KB</span>}
          </span>
        );

        return (
          <span key={f.id} className="inline-flex items-center gap-1">
            {chip}
            {canManage && (
              <button
                type="button"
                onClick={() => deleteFile(f)}
                disabled={deletingId === f.id}
                className="inline-flex items-center justify-center p-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50 transition-colors"
                title="Faylni o'chirish"
              >
                {deletingId === f.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Trash2 size={12} />
                }
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

interface HomeworkMeta {
  id:                   string;
  title:                string;
  max_score:            number;
  due_date:             string | null;
  hard_close_at:        string | null;
  allow_late_submission: boolean;
  accepting_submissions?: boolean | null;
  late_penalty_percent: number | null;
}

function GradeCell({
  sub,
  hwId,
  maxScore,
  latePenaltyPercent,
  onGraded,
}: {
  sub: Submission;
  hwId: string;
  maxScore: number;
  latePenaltyPercent?: number | null;
  onGraded: () => void;
}) {
  // IMPORTANT: keep score as a string so the field renders empty until the
  // grader types something. Initialising with `maxScore` was the cause of the
  // "100/100 even though I typed 90" bug — clicking Save before any input
  // submitted the pre-filled max value.
  const initialScore    = sub.grade?.score != null ? String(sub.grade.score) : "";
  const initialFeedback = sub.grade?.feedback ?? "";

  const [score,    setScore]    = useState<string>(initialScore);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [saving,   setSaving]   = useState(false);
  const [open,     setOpen]     = useState(false);
  const [deleting, setDeleting] = useState(false);

  function openForEdit() {
    // Reset state from the latest sub.grade in case it changed between renders
    setScore(sub.grade?.score != null ? String(sub.grade.score) : "");
    setFeedback(sub.grade?.feedback ?? "");
    setOpen(true);
  }

  function cancel() {
    setScore(initialScore);
    setFeedback(initialFeedback);
    setOpen(false);
  }

  async function save() {
    const trimmed = score.trim();
    if (trimmed === "") {
      toast.error("Ball kiriting");
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n > maxScore) {
      toast.error(`Ball 0 dan ${maxScore} gacha bo'lishi kerak`);
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/homeworks/${hwId}/submissions/${sub.id}/grade`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ score: n, feedback: feedback.trim() || null }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Baho saqlandi");
      setOpen(false);
      onGraded();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Xato");
    }
  }

  async function deleteGrade() {
    if (!sub.grade) return;
    if (!confirm("Bahoni o'chirishni tasdiqlaysizmi? Ishtirokchi qayta baholanishi mumkin.")) return;
    setDeleting(true);
    const res = await fetch(`/api/homeworks/${hwId}/submissions/${sub.id}/grade`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (res.ok) {
      toast.success("Baho o'chirildi");
      setOpen(false);
      onGraded();
    } else {
      toast.error("Xato");
    }
  }

  // Existing grade — show clickable badge to enter edit mode
  if (sub.grade && !open) {
    return (
      <button
        onClick={openForEdit}
        className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-900 transition-colors group"
        title="Bahoni tahrirlash"
      >
        <Star size={13} className="text-amber-400" />
        {sub.grade.score}/{maxScore}
        <Pencil size={11} className="text-gray-300 group-hover:text-gray-500 ml-0.5" />
      </button>
    );
  }

  // Edit form (used both for first-time grading and editing existing)
  return (
    <div className="flex flex-col gap-1.5">
      {sub.is_late && latePenaltyPercent != null && latePenaltyPercent > 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle size={11} />
          Kechikkan topshiriq — {latePenaltyPercent}% jarima
        </p>
      )}
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="number"
        min={0}
        max={maxScore}
        step="1"
        inputMode="numeric"
        value={score}
        onChange={(e) => setScore(e.target.value)}
        placeholder={`0–${maxScore}`}
        className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="text-gray-400 text-sm">/{maxScore}</span>
      <input
        type="text"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Izoh"
        className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={save}
        disabled={saving || deleting}
        className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : "Saqlash"}
      </button>
      {sub.grade && (
        <button
          onClick={deleteGrade}
          disabled={saving || deleting}
          className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-colors"
          title="Bahoni o'chirish"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : "O'chirish"}
        </button>
      )}
      {open && (
        <button
          onClick={cancel}
          disabled={saving || deleting}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          Bekor
        </button>
      )}
    </div>
    </div>
  );
}

export default function HomeworkDetailPage() {
  const { id: trainingId, hwId } = useParams<{ id: string; hwId: string }>();
  const canManage = usePermission("trainings", "edit");

  const [hw,        setHw]        = useState<HomeworkMeta | null>(null);
  const [subs,      setSubs]      = useState<Submission[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [timeline,  setTimeline]  = useState<{ subId: string; name: string } | null>(null);
  const [lateFilter, setLateFilter] = useState<"all" | "on_time" | "late">("all");
  const [acceptingAction, setAcceptingAction] = useState<"close" | "reopen" | null>(null);
  const [acceptingSaving, setAcceptingSaving] = useState(false);

  // Fetch homework meta from the training's homework list
  const load = useCallback(async () => {
    setLoading(true);
    const [hwsRes, subsRes, matsRes] = await Promise.all([
      fetch(`/api/trainings/${trainingId}/homeworks`).then((r) => r.json()),
      fetch(`/api/homeworks/${hwId}/submissions`).then((r) => r.json()),
      fetch(`/api/homeworks/${hwId}/materials`).then((r) => r.json()),
    ]);
    const meta = Array.isArray(hwsRes) ? hwsRes.find((h: HomeworkMeta & { id: string }) => h.id === hwId) : null;
    setHw(meta ?? null);
    setSubs(Array.isArray(subsRes) ? subsRes : []);
    setMaterials(Array.isArray(matsRes) ? matsRes : []);
    setLoading(false);
  }, [trainingId, hwId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function updateAcceptingState(action: "close" | "reopen") {
    if (!hw) return;

    setAcceptingSaving(true);

    const res = await fetch(`/api/homeworks/${hw.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(action === "close"
        ? { accepting_submissions: false }
        : { accepting_submissions: true }),
    });

    setAcceptingSaving(false);
    if (res.ok) {
      toast.success(action === "close" ? "Topshiriqlar yopildi" : "Topshiriqlar qayta ochildi");
      setAcceptingAction(null);
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Qabul qilish holatini o'zgartirib bo'lmadi");
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
      <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
    </div>
  );

  if (!hw) return (
    <div className="text-center py-20 text-gray-400">Vazifa topilmadi</div>
  );

  const graded    = subs.filter((s) => s.grade).length;
  const submitted = subs.length;
  const acceptingState = getHomeworkAcceptingState(hw);
  const isAcceptingClosed = acceptingState === "closed";

  return (
    <div className="space-y-6">
      <PageHeader
        title={hw.title}
        subtitle={`Maksimal ball: ${hw.max_score}${hw.due_date ? ` · Muddat: ${fmtUzDate(hw.due_date)}` : ""} · ${getHomeworkAcceptingHint(hw)}`}
        back
        backHref={`/trainings/${trainingId}/homeworks`}
        actions={
          canManage ? (
            <Button
              size="sm"
              variant={isAcceptingClosed ? "primary" : "outline"}
              onClick={() => setAcceptingAction(isAcceptingClosed ? "reopen" : "close")}
            >
              {isAcceptingClosed ? "Topshiriqlarni qayta ochish" : "Topshiriqlarni yopish"}
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="text-center py-4">
          <div className="flex justify-center">
            <HomeworkAcceptingBadge homework={hw} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Qabul holati</p>
        </Card>
        {[
          { label: "Topshirildi", value: submitted, color: "text-blue-600" },
          { label: "Baholandi",   value: graded,    color: "text-green-600" },
          { label: "Kutilmoqda",  value: submitted - graded, color: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label} className="text-center py-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Late filter pills */}
      {subs.some((s) => s.is_late) && (
        <div className="flex gap-2">
          {(["all", "on_time", "late"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setLateFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                lateFilter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "all" ? "Barchasi" : f === "on_time" ? "O'z vaqtida" : "⏰ Kechikkan"}
            </button>
          ))}
        </div>
      )}

      {/* Submissions table */}
      <Card>
        <CardHeader>
          <CardTitle>Topshiriqlar</CardTitle>
        </CardHeader>
        <Table>
          <Thead>
            <tr>
              <Th>Ishtirokchi</Th>
              <Th>Javob</Th>
              <Th>Topshirilgan</Th>
              <Th>Baho</Th>
            </tr>
          </Thead>
          <Tbody>
            {subs.length === 0 ? (
              <EmptyRow cols={4} message="Hali topshiriq yo'q" />
            ) : subs
                .filter((s) =>
                  lateFilter === "all" ? true :
                  lateFilter === "late" ? s.is_late :
                  !s.is_late
                )
                .map((sub) => (
              <Tr key={sub.id}>
                <Td className="font-medium text-gray-900">
                  <button
                    onClick={() => setTimeline({ subId: sub.id, name: sub.participant.full_name })}
                    className="hover:text-blue-600 hover:underline transition-colors text-left"
                    title="Tarixni ko'rish"
                  >
                    {sub.participant.full_name}
                  </button>
                </Td>
                <Td className="max-w-xs">
                  {sub.text && (
                    <p className="text-sm text-gray-700 line-clamp-2">{sub.text}</p>
                  )}
                  <FileList
                    files={sub.files}
                    canManage={canManage}
                    hwId={hwId}
                    submissionId={sub.id}
                    onDeleted={load}
                  />
                  {!sub.text && sub.files.length === 0 && (
                    <span className="text-gray-400 text-xs italic">Bo&apos;sh</span>
                  )}
                </Td>
                <Td className="text-xs text-gray-400 whitespace-nowrap">
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-1">
                      {sub.grade
                        ? <CheckCircle2 size={12} className="text-green-500" />
                        : <Clock size={12} className="text-gray-300" />}
                      {fmtUzDateTime(sub.submitted_at)}
                    </span>
                    <TimelinesssBadge isLate={sub.is_late} lateByDays={sub.late_by_days} />
                  </span>
                </Td>
                <Td>
                  {canManage ? (
                    <GradeCell
                      sub={sub}
                      hwId={hwId}
                      maxScore={hw.max_score}
                      latePenaltyPercent={hw.late_penalty_percent}
                      onGraded={load}
                    />
                  ) : sub.grade ? (
                    <span className="text-sm font-semibold text-green-700">{sub.grade.score}/{hw.max_score}</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>

      {/* Materials panel */}
      <Card>
        <div className="p-5">
          <MaterialsPanel
            hwId={hwId}
            materials={materials}
            canManage={canManage}
            onUpdate={load}
          />
        </div>
      </Card>

      {/* Submission activity timeline drawer */}
      {timeline && (
        <SubmissionTimeline
          hwId={hwId}
          subId={timeline.subId}
          participantName={timeline.name}
          onClose={() => setTimeline(null)}
        />
      )}

      <ConfirmModal
        open={acceptingAction === "close"}
        onClose={() => setAcceptingAction(null)}
        onConfirm={() => updateAcceptingState("close")}
        loading={acceptingSaving}
        danger
        title="Topshiriqlarni yopish"
        message="Topshiriqlar qabul qilinishi yopiladi. Ishtirokchilar bu vazifaga yangi javob yubora olmaydi. Mavjud javoblar va baholar o'zgarmaydi. Davom etasizmi?"
        confirmLabel="Yopish"
      />

      <ConfirmModal
        open={acceptingAction === "reopen"}
        onClose={() => setAcceptingAction(null)}
        onConfirm={() => updateAcceptingState("reopen")}
        loading={acceptingSaving}
        title="Topshiriqlarni qayta ochish"
        message="Topshiriqlar qabul qilinishi qayta ochiladi. Ishtirokchilar yana javob yuborishi mumkin, muddat va kechikish qoidalari saqlanadi. Davom etasizmi?"
        confirmLabel="Qayta ochish"
      />
    </div>
  );
}
