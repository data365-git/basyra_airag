"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, BookOpen, Users, Star, ChevronRight, Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { usePermission } from "@/hooks/usePermission";
import toast from "react-hot-toast";

interface Homework {
  id:                   string;
  title:                string;
  description:          string | null;
  due_date:             string | null;
  hard_close_at:        string | null;
  allow_late_submission: boolean;
  late_penalty_percent: number | null;
  max_score:            number;
  created_at:           string;
  submission_count:     number;
  graded_count:         number;
  late_count:           number;
  avg_score:            number | null;
}

export default function HomeworksPage() {
  const { id: trainingId } = useParams<{ id: string }>();
  const router = useRouter();
  const canManage = usePermission("trainings", "edit");

  const [homeworks,    setHomeworks]    = useState<Homework[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [trainingName, setTrainingName] = useState("");

  // Add modal
  const [addOpen,    setAddOpen]    = useState(false);
  const [addForm,    setAddForm]    = useState({
    title: "", description: "", start_date: "", due_date: "",
    hard_close_at: "", allow_late_submission: true, late_penalty_percent: "",
  });
  const [addSaving,  setAddSaving]  = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Homework | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  useEffect(() => { load(); }, [trainingId]);

  async function load() {
    setLoading(true);
    const [trainingRes, hwRes] = await Promise.all([
      fetch(`/api/trainings/${trainingId}`).then((r) => r.json()),
      fetch(`/api/trainings/${trainingId}/homeworks`).then((r) => r.json()),
    ]);
    setTrainingName(trainingRes?.name ?? "");
    setHomeworks(Array.isArray(hwRes) ? hwRes : []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.title.trim()) return;
    setAddSaving(true);
    const res = await fetch(`/api/trainings/${trainingId}/homeworks`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:                addForm.title.trim(),
        description:          addForm.description.trim() || null,
        start_date:           addForm.start_date || null,
        due_date:             addForm.due_date || null,
        hard_close_at:        addForm.hard_close_at || null,
        allow_late_submission: addForm.allow_late_submission,
        late_penalty_percent: addForm.late_penalty_percent !== "" ? Number(addForm.late_penalty_percent) : null,
      }),
    });
    setAddSaving(false);
    if (res.ok) {
      toast.success("Vazifa yaratildi");
      setAddOpen(false);
      setAddForm({ title: "", description: "", start_date: "", due_date: "", hard_close_at: "", allow_late_submission: true, late_penalty_percent: "" });
      await load();
    } else {
      toast.error("Xato yuz berdi");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`/api/homeworks/${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteTarget(null);
    toast.success("O'chirildi");
    await load();
  }

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vazifalar"
        subtitle={trainingName}
        back
        backHref={`/trainings/${trainingId}`}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> Vazifa qo'shish
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Barcha vazifalar ({homeworks.length})</CardTitle>
        </CardHeader>

        {homeworks.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">Hali vazifa yo'q</p>
            {canManage && (
              <button onClick={() => setAddOpen(true)} className="mt-3 text-sm text-blue-600 hover:underline">
                Birinchi vazifani qo'shish
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {homeworks.map((hw) => (
              <div key={hw.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <BookOpen size={18} className="text-blue-600" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{hw.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    {hw.due_date && <span>Muddat: {hw.due_date}</span>}
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {hw.submission_count} topshirildi
                    </span>
                    {hw.late_count > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock size={11} /> {hw.late_count} kechikkan
                      </span>
                    )}
                    {hw.graded_count > 0 && (
                      <span className="flex items-center gap-1 text-green-600">
                        <Star size={11} /> avg {hw.avg_score}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/trainings/${trainingId}/homeworks/${hw.id}`}>
                    <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-blue-600 hover:bg-blue-50 font-medium transition-colors">
                      Ko'rish <ChevronRight size={14} />
                    </button>
                  </Link>
                  {canManage && (
                    <button
                      onClick={() => setDeleteTarget(hw)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add homework modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Yangi vazifa"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Bekor qilish</Button>
            <Button form="add-hw-form" type="submit" loading={addSaving}>Yaratish</Button>
          </>
        }
      >
        <form id="add-hw-form" onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Sarlavha <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={addForm.title}
              onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Masalan: 1-mustaqil ish"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Tavsif</label>
            <textarea
              rows={3}
              value={addForm.description}
              onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Vazifa haqida batafsil..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Boshlanish sanasi</label>
              <input
                type="date"
                value={addForm.start_date}
                onChange={(e) => setAddForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Muddat (oxiri)</label>
              <input
                type="date"
                value={addForm.due_date}
                onChange={(e) => setAddForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Late submission settings */}
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={addForm.allow_late_submission}
                onChange={(e) => setAddForm((f) => ({ ...f, allow_late_submission: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">Kechikkan topshiriqqa ruxsat</span>
            </label>
            {addForm.allow_late_submission && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Qat'iy yopilish sanasi</label>
                  <input
                    type="date"
                    value={addForm.hard_close_at}
                    onChange={(e) => setAddForm((f) => ({ ...f, hard_close_at: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Jarima (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={addForm.late_penalty_percent}
                    onChange={(e) => setAddForm((f) => ({ ...f, late_penalty_percent: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        danger
        title="Vazifani o'chirish"
        message={`"${deleteTarget?.title}" va barcha topshiriqlar o'chiriladi. Tasdiqlaysizmi?`}
        confirmLabel="O'chirish"
      />
    </div>
  );
}
