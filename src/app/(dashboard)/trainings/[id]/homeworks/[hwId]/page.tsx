"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "@/components/ui/Table";
import { usePermission } from "@/hooks/usePermission";
import { CheckCircle2, Clock, Star, Loader2, FileText, Mic, Video, Image, File } from "lucide-react";
import toast from "react-hot-toast";

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
  grade:        { score: number; feedback: string | null; graded_at: string } | null;
  files:        SubmissionFile[];
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
  id:        string;
  title:     string;
  max_score: number;
  due_date:  string | null;
}

function GradeCell({
  sub,
  hwId,
  maxScore,
  onGraded,
}: {
  sub: Submission;
  hwId: string;
  maxScore: number;
  onGraded: () => void;
}) {
  const [score,    setScore]    = useState(sub.grade?.score ?? maxScore);
  const [feedback, setFeedback] = useState(sub.grade?.feedback ?? "");
  const [saving,   setSaving]   = useState(false);
  const [open,     setOpen]     = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/homeworks/${hwId}/submissions/${sub.id}/grade`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ score: Number(score), feedback: feedback.trim() || null }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Baho saqlandi");
      setOpen(false);
      onGraded();
    } else {
      toast.error("Xato");
    }
  }

  if (sub.grade && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-900 transition-colors"
      >
        <Star size={13} className="text-amber-400" />
        {sub.grade.score}/{maxScore}
      </button>
    );
  }

  if (open || !sub.grade) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={maxScore}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
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
          disabled={saving}
          className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : "Saqlash"}
        </button>
        {open && (
          <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Bekor
          </button>
        )}
      </div>
    );
  }

  return null;
}

export default function HomeworkDetailPage() {
  const { id: trainingId, hwId } = useParams<{ id: string; hwId: string }>();
  const canManage = usePermission("trainings", "edit");

  const [hw,   setHw]   = useState<HomeworkMeta | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch homework meta from the training's homework list
  async function load() {
    setLoading(true);
    const [hwsRes, subsRes] = await Promise.all([
      fetch(`/api/trainings/${trainingId}/homeworks`).then((r) => r.json()),
      fetch(`/api/homeworks/${hwId}/submissions`).then((r) => r.json()),
    ]);
    const meta = Array.isArray(hwsRes) ? hwsRes.find((h: any) => h.id === hwId) : null;
    setHw(meta ?? null);
    setSubs(Array.isArray(subsRes) ? subsRes : []);
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
        subtitle={`Maksimal ball: ${hw.max_score}${hw.due_date ? ` · Muddat: ${hw.due_date}` : ""}`}
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
            ) : subs.map((sub) => (
              <Tr key={sub.id}>
                <Td className="font-medium text-gray-900">{sub.participant.full_name}</Td>
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
                  <span className="flex items-center gap-1">
                    {sub.grade
                      ? <CheckCircle2 size={12} className="text-green-500" />
                      : <Clock size={12} className="text-gray-300" />}
                    {new Date(sub.submitted_at).toLocaleDateString("uz-UZ")}
                  </span>
                </Td>
                <Td>
                  {canManage ? (
                    <GradeCell sub={sub} hwId={hwId} maxScore={hw.max_score} onGraded={load} />
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
    </div>
  );
}
