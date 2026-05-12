"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Search, Users, Star, ChevronRight, AlertCircle, Clock, Pencil, X } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { HomeworkAcceptingBadge, getHomeworkAcceptingHint } from "@/components/homework/HomeworkAcceptingStatus";

interface Training { id: string; name: string }

interface Homework {
  id:                    string;
  title:                 string;
  description:           string | null;
  due_date:              string | null;
  start_date:            string | null;
  hard_close_at:         string | null;
  allow_late_submission: boolean;
  accepting_submissions?: boolean | null;
  late_penalty_percent:  number | null;
  max_score:             number;
  created_at:            string;
  training:              { id: string; name: string };
  submission_count:      number;
  graded_count:          number;
  pending_grade:         number;
  avg_score:             number | null;
  is_overdue:            boolean;
}

type FilterKey = "all" | "pending_grade" | "overdue";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",           label: "Barchasi"        },
  { key: "pending_grade", label: "Baholanmagan"    },
  { key: "overdue",       label: "Muddati o'tgan"  },
];

export default function HomeworksCommandCenter() {
  const [homeworks,  setHomeworks]  = useState<Homework[]>([]);
  const [trainings,  setTrainings]  = useState<Training[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [q,          setQ]          = useState("");
  const [trainingId, setTrainingId] = useState<string>("");
  const [filter,     setFilter]     = useState<FilterKey>("all");
  const [editHw,     setEditHw]     = useState<Homework | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [editForm,   setEditForm]   = useState({
    title: "", description: "", due_date: "", start_date: "", hard_close_at: "",
    allow_late_submission: true, late_penalty_percent: "", max_score: 100,
  });

  // Load trainings once (for filter dropdown)
  useEffect(() => {
    fetch("/api/trainings")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setTrainings(data) : setTrainings([]))
      .catch(() => setTrainings([]));
  }, []);

  // Reload on any filter change
  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams();
      if (q)           params.set("q", q);
      if (trainingId)  params.set("trainingId", trainingId);
      if (filter !== "all") params.set("filter", filter);

      if (!cancelled) setLoading(true);
      try {
        const res  = await fetch(`/api/homeworks?${params.toString()}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!cancelled) setHomeworks(Array.isArray(data) ? data : []);
      } catch {
        /* aborted or network */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [q, trainingId, filter]);

  const totals = useMemo(() => {
    const pending = homeworks.reduce((s, h) => s + h.pending_grade, 0);
    const overdue = homeworks.filter((h) => h.is_overdue).length;
    return { pending, overdue, total: homeworks.length };
  }, [homeworks]);

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editHw) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/homeworks/${editHw.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:                 editForm.title,
          description:           editForm.description || null,
          due_date:              editForm.due_date || null,
          start_date:            editForm.start_date || null,
          hard_close_at:         editForm.hard_close_at || null,
          allow_late_submission: editForm.allow_late_submission,
          late_penalty_percent:  editForm.late_penalty_percent !== "" ? Number(editForm.late_penalty_percent) : null,
          max_score:             editForm.max_score,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated = await res.json();
      setHomeworks(hws => hws.map(h => h.id === editHw.id ? {
        ...h,
        title:                 updated.title,
        description:           updated.description,
        due_date:              updated.due_date,
        start_date:            updated.start_date,
        hard_close_at:         updated.hard_close_at,
        allow_late_submission: updated.allow_late_submission,
        late_penalty_percent:  updated.late_penalty_percent,
        max_score:             updated.max_score,
      } : h));
      setEditHw(null);
    } catch {
      alert("Saqlashda xato yuz berdi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vazifalar"
        subtitle={`${totals.total} ta vazifa · ${totals.pending} baholanmagan · ${totals.overdue} muddati o'tgan`}
      />

      {/* Filter bar */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sarlavha bo'yicha qidirish..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={trainingId}
          onChange={(e) => setTrainingId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Barcha treninglar</option>
          {trainings.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === f.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Ro&apos;yxat ({homeworks.length})</CardTitle>
        </CardHeader>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {[1,2,3,4].map((i) => (
              <div key={i} className="h-16 bg-gray-50 animate-pulse" />
            ))}
          </div>
        ) : homeworks.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">Vazifa topilmadi</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {homeworks.map((hw) => (
              <div key={hw.id} className="relative">
                <Link
                  href={`/trainings/${hw.training.id}/homeworks/${hw.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    hw.pending_grade > 0 ? "bg-amber-50" : "bg-blue-50"
                  }`}>
                    <BookOpen size={18} className={hw.pending_grade > 0 ? "text-amber-600" : "text-blue-600"} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{hw.title}</p>
                      <HomeworkAcceptingBadge homework={hw} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                      <span className="truncate">{hw.training.name}</span>
                      {hw.due_date && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {hw.due_date}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <AlertCircle size={11} /> {getHomeworkAcceptingHint(hw)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={11} /> {hw.submission_count}
                      </span>
                      {hw.pending_grade > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          {hw.pending_grade} baholanmagan
                        </span>
                      )}
                      {hw.graded_count > 0 && hw.avg_score !== null && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <Star size={11} /> avg {hw.avg_score}%
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditHw(hw);
                      setEditForm({
                        title:                 hw.title,
                        description:           hw.description ?? "",
                        due_date:              hw.due_date ?? "",
                        start_date:            hw.start_date ?? "",
                        hard_close_at:         hw.hard_close_at ?? "",
                        allow_late_submission: hw.allow_late_submission ?? true,
                        late_penalty_percent:  String(hw.late_penalty_percent ?? ""),
                        max_score:             hw.max_score,
                      });
                    }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0 z-10"
                    title="Tahrirlash"
                  >
                    <Pencil size={14} />
                  </button>

                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editHw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Vazifani tahrirlash</h2>
              <button onClick={() => setEditHw(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sarlavha *</label>
                <input required value={editForm.title} onChange={e => setEditForm(f => ({...f, title: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tavsif</label>
                <textarea rows={3} value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              {/* Dates row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Boshlanish sanasi</label>
                  <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({...f, start_date: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Muddat (deadline)</label>
                  <input type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({...f, due_date: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {/* Hard close */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Qat&apos;iy yopilish sanasi</label>
                <input type="date" value={editForm.hard_close_at} onChange={e => setEditForm(f => ({...f, hard_close_at: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {/* Max score + late penalty row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Maksimal ball</label>
                  <input type="number" min={1} max={1000} value={editForm.max_score} onChange={e => setEditForm(f => ({...f, max_score: Number(e.target.value)}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kechikish jarima %</label>
                  <input type="number" min={0} max={100} value={editForm.late_penalty_percent} onChange={e => setEditForm(f => ({...f, late_penalty_percent: e.target.value}))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {/* Allow late submission */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editForm.allow_late_submission} onChange={e => setEditForm(f => ({...f, allow_late_submission: e.target.checked}))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">Kech topshirishga ruxsat</span>
              </label>
              {/* Warning if submissions exist */}
              {editHw.submission_count > 0 && (
                <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{editHw.submission_count} ta topshirik mavjud. Deadline o&apos;zgartirilsa, statuslar qayta hisoblanishi mumkin.</span>
                </div>
              )}
              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditHw(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Bekor qilish
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
