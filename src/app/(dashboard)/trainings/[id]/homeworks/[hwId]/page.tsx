"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { usePermission } from "@/hooks/usePermission";
import { CheckCircle2, Clock, Star, Loader2, FileText, Mic, Video, Image, File, Pencil, Link2, BookOpen, AlertTriangle, Trash2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { fmtUzDate, fmtUzDateTime } from "@/lib/dateFormat";
import { SubmissionTimeline } from "@/components/homework/SubmissionTimeline";

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

interface Material {
  id:             string;
  kind:           "PDF" | "VIDEO" | "AUDIO" | "IMAGE" | "DOCUMENT" | "LINK";
  title:          string;
  description:    string | null;
  storage_url:    string | null;
  file_name:      string | null;
  file_size_bytes: number | null;
  url:            string | null;
  sort_order:     number;
}

function MaterialKindIcon({ kind }: { kind: Material["kind"] }) {
  if (kind === "LINK")     return <Link2   size={14} className="text-blue-500 shrink-0" />;
  if (kind === "VIDEO")    return <Video   size={14} className="text-purple-500 shrink-0" />;
  if (kind === "AUDIO")    return <Mic     size={14} className="text-green-500 shrink-0" />;
  if (kind === "IMAGE")    return <Image   size={14} className="text-pink-500 shrink-0" />;
  if (kind === "PDF")      return <FileText size={14} className="text-red-500 shrink-0" />;
  return <File size={14} className="text-gray-400 shrink-0" />;
}

function FileIcon({ type }: { type: string }) {
  if (type === "photo")    return <Image    size={13} className="text-blue-400 shrink-0" />;
  if (type === "video")    return <Video    size={13} className="text-purple-400 shrink-0" />;
  if (type === "audio" || type === "voice") return <Mic size={13} className="text-green-400 shrink-0" />;
  if (type === "document") return <FileText size={13} className="text-orange-400 shrink-0" />;
  return <File size={13} className="text-gray-400 shrink-0" />;
}

function FileList({ files }: { files: SubmissionFile[] }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {files.map((f) => {
        // Prefer download proxy — works for both R2-uploaded and Telegram-only files
        const href = (f.storage_url || f.telegram_file_id)
          ? `/api/homework-files/${f.id}/download`
          : null;
        return href ? (
          <a
            key={f.id}
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
            key={f.id}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-500 text-xs rounded-lg"
            title="Fayl mavjud emas"
          >
            <FileIcon type={f.file_type} />
            <span className="max-w-[120px] truncate">{f.file_name}</span>
            {f.file_size_bytes && <span className="text-gray-400">{Math.round(f.file_size_bytes / 1024)}KB</span>}
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
  allow_late_submission: boolean;
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
  const [matPanel,  setMatPanel]  = useState(false);
  const [matAdding, setMatAdding] = useState(false);
  const [matForm,   setMatForm]   = useState({ kind: "LINK" as "LINK" | "FILE", title: "", description: "", url: "" });
  const [matFile,   setMatFile]   = useState<File | null>(null);
  const [matSaving, setMatSaving] = useState(false);

  // Fetch homework meta from the training's homework list
  async function load() {
    setLoading(true);
    const [hwsRes, subsRes, matsRes] = await Promise.all([
      fetch(`/api/trainings/${trainingId}/homeworks`).then((r) => r.json()),
      fetch(`/api/homeworks/${hwId}/submissions`).then((r) => r.json()),
      fetch(`/api/homeworks/${hwId}/materials`).then((r) => r.json()),
    ]);
    const meta = Array.isArray(hwsRes) ? hwsRes.find((h: any) => h.id === hwId) : null;
    setHw(meta ?? null);
    setSubs(Array.isArray(subsRes) ? subsRes : []);
    setMaterials(Array.isArray(matsRes) ? matsRes : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [hwId]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={hw.title}
        subtitle={`Maksimal ball: ${hw.max_score}${hw.due_date ? ` · Muddat: ${fmtUzDate(hw.due_date)}` : ""}`}
        back
        backHref={`/trainings/${trainingId}/homeworks`}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
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
                  <FileList files={sub.files} />
                  {!sub.text && sub.files.length === 0 && (
                    <span className="text-gray-400 text-xs italic">Bo'sh</span>
                  )}
                </Td>
                <Td className="text-xs text-gray-400 whitespace-nowrap">
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1">
                      {sub.grade
                        ? <CheckCircle2 size={12} className="text-green-500" />
                        : <Clock size={12} className="text-gray-300" />}
                      {fmtUzDateTime(sub.submitted_at)}
                    </span>
                    {sub.is_late && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle size={11} />
                        {sub.late_by_days != null ? `${sub.late_by_days} kun kech` : "Kechikkan"}
                      </span>
                    )}
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
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen size={16} className="text-gray-400" />
              O'quv materiallari
            </CardTitle>
            {canManage && (
              <button
                onClick={() => setMatPanel((p) => !p)}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
              >
                <Plus size={13} />
                Qo'shish
              </button>
            )}
          </div>
        </CardHeader>

        {/* Add material form */}
        {matPanel && canManage && (
          <div className="px-4 pb-4 border-b border-gray-100">
            <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl">
              {/* Kind selector */}
              <div className="flex gap-1 flex-wrap">
                {(["LINK", "FILE"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setMatForm((f) => ({ ...f, kind: k }))}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                      matForm.kind === k
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
                    }`}
                  >
                    {k === "LINK" ? "🔗 Havola" : "📁 Fayl"}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={matForm.title}
                onChange={(e) => setMatForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Sarlavha"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={matForm.description}
                onChange={(e) => setMatForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Tavsif (ixtiyoriy)"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {matForm.kind === "LINK" ? (
                <input
                  type="url"
                  value={matForm.url}
                  onChange={(e) => setMatForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <input
                  type="file"
                  onChange={(e) => setMatFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-600"
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!matForm.title.trim()) { return; }
                    setMatSaving(true);
                    try {
                      if (matForm.kind === "LINK") {
                        await fetch(`/api/homeworks/${hwId}/materials`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            kind: "LINK",
                            title: matForm.title.trim(),
                            description: matForm.description.trim() || null,
                            url: matForm.url.trim(),
                          }),
                        });
                      } else if (matFile) {
                        const fd = new FormData();
                        fd.append("file", matFile);
                        fd.append("title", matForm.title.trim());
                        if (matForm.description.trim()) fd.append("description", matForm.description.trim());
                        await fetch(`/api/homeworks/${hwId}/materials`, { method: "POST", body: fd });
                      }
                      setMatForm({ kind: "LINK", title: "", description: "", url: "" });
                      setMatFile(null);
                      setMatPanel(false);
                      load();
                    } finally {
                      setMatSaving(false);
                    }
                  }}
                  disabled={matSaving}
                  className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {matSaving ? <Loader2 size={12} className="animate-spin" /> : "Saqlash"}
                </button>
                <button
                  onClick={() => { setMatPanel(false); setMatForm({ kind: "LINK", title: "", description: "", url: "" }); setMatFile(null); }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Bekor
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Material list */}
        {materials.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-gray-400 italic">Materiallar yo'q</div>
        ) : (
          <div className="px-4 pb-4 space-y-2">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 group">
                <MaterialKindIcon kind={m.kind} />
                <div className="flex-1 min-w-0">
                  {m.kind === "LINK" && m.url ? (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-700 hover:underline truncate block"
                    >
                      {m.title}
                    </a>
                  ) : m.storage_url ? (
                    <a
                      href={m.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-800 hover:text-blue-700 truncate block"
                    >
                      {m.title}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-gray-800 truncate block">{m.title}</span>
                  )}
                  {m.description && (
                    <p className="text-xs text-gray-400 truncate">{m.description}</p>
                  )}
                </div>
                {m.file_size_bytes && (
                  <span className="text-xs text-gray-400 shrink-0">{Math.round(m.file_size_bytes / 1024)}KB</span>
                )}
                {canManage && (
                  <button
                    onClick={async () => {
                      if (!confirm("Materialni o'chirishni tasdiqlaysizmi?")) return;
                      await fetch(`/api/homeworks/${hwId}/materials/${m.id}`, { method: "DELETE" });
                      load();
                    }}
                    className="shrink-0 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="O'chirish"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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
    </div>
  );
}
