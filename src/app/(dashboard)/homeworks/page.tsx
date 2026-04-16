"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Search, Users, Star, ChevronRight, AlertCircle, Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

interface Training { id: string; name: string }

interface Homework {
  id:               string;
  title:            string;
  description:      string | null;
  due_date:         string | null;
  max_score:        number;
  created_at:       string;
  training:         { id: string; name: string };
  submission_count: number;
  graded_count:     number;
  pending_grade:    number;
  avg_score:        number | null;
  is_overdue:       boolean;
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
              <Link
                key={hw.id}
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
                    {hw.is_overdue && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full shrink-0">
                        <AlertCircle size={10} /> muddati o&apos;tgan
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    <span className="truncate">{hw.training.name}</span>
                    {hw.due_date && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {hw.due_date}
                      </span>
                    )}
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

                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
