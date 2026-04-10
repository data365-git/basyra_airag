"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { TrainingCard } from "@/components/trainings/TrainingCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import type { Training } from "@/types";

export default function TrainingsPage() {
  const canManage = usePermission("manage_trainings");
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "upcoming" | "completed">("all");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("trainings")
        .select("*, participant_count:training_participants(count), session_count:sessions(count)")
        .order("created_at", { ascending: false });

      setTrainings(
        (data || []).map((t: any) => ({
          ...t,
          participant_count: t.participant_count?.[0]?.count || 0,
          session_count: t.session_count?.[0]?.count || 0,
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  const filtered = trainings.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || t.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trainings</h1>
          <p className="text-gray-500 text-sm mt-1">{trainings.length} total</p>
        </div>
        {canManage && (
          <Link href="/trainings/new">
            <Button>
              <Plus size={16} /> New Training
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trainings..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(["all", "active", "upcoming", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No trainings found</p>
          {canManage && (
            <Link href="/trainings/new">
              <Button className="mt-4">Create first training</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => <TrainingCard key={t.id} training={t} />)}
        </div>
      )}
    </div>
  );
}
