"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";

interface SupervisorMe {
  id:    string;
  name:  string;
  email: string;
}

interface Training {
  id:    string;
  name:  string;
  color: string;
}

interface Person {
  id:           string;
  name:         string;
  trainings:    Training[];
  overall_score?: number;
}

export default function SupervisorDashboardPage() {
  const router = useRouter();

  const [me,      setMe]      = useState<SupervisorMe | null>(null);
  const [people,  setPeople]  = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const meRes = await fetch("/api/supervisor/auth/me");
      if (meRes.status === 401) {
        router.push("/supervisor/login");
        return;
      }
      const meData = await meRes.json().catch(() => null);
      if (meData) setMe(meData);

      const reportsRes = await fetch("/api/supervisor/reports");
      if (reportsRes.ok) {
        const data = await reportsRes.json().catch(() => ({}));
        const list: Person[] = data.people ?? [];

        // Single-person shortcut — skip roster
        if (list.length === 1) {
          router.replace(`/supervisor/people/${list[0].id}`);
          return;
        }

        setPeople(list);
      }

      setLoading(false);
    }
    init();
  }, [router]);

  async function logout() {
    await fetch("/api/supervisor/auth/logout", { method: "POST" });
    router.push("/supervisor/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-teal-600" />
      </div>
    );
  }

  const atRisk  = people.filter((p) => (p.overall_score ?? 100) < 70);
  const onTrack = people.filter((p) => (p.overall_score ?? 100) >= 70);

  function PersonCard({ person }: { person: Person }) {
    const score = person.overall_score;
    const isRisk = (score ?? 100) < 70;
    return (
      <div
        key={person.id}
        onClick={() => router.push(`/supervisor/people/${person.id}`)}
        className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRisk ? "bg-red-400" : "bg-green-400"}`} />
            <p className="font-semibold text-gray-900">{person.name}</p>
          </div>
          {score !== undefined && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              score >= 80 ? "bg-green-100 text-green-700" :
              score >= 70 ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            }`}>
              {score}%
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {person.trainings.map((t) => (
            <span
              key={t.id}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/supervisor/people/${person.id}?trainingId=${t.id}`);
              }}
              className="text-xs px-2 py-0.5 rounded-full text-white cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center">
            <ShieldCheck size={18} className="text-teal-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              {me ? `Salom, ${me.name}!` : "Nazoratchi kabineti"}
            </p>
            {me && (
              <p className="text-xs text-gray-400 leading-tight">{me.email}</p>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-3 py-2 rounded-lg"
        >
          <LogOut size={14} />
          Chiqish
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-3">
        {/* Summary bar */}
        {people.length > 0 && (
          <div className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mb-2">
            <p className="text-sm text-teal-800 font-medium">
              <span className="font-bold">{onTrack.length}</span> of{" "}
              <span className="font-bold">{people.length}</span> on track
              {atRisk.length > 0 && (
                <span className="ml-2 text-amber-700 font-semibold">· {atRisk.length} need attention</span>
              )}
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide px-1">
          Biriktirilgan o&apos;quvchilar
        </p>

        {people.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 shadow-sm">
            <p className="font-medium text-gray-500">
              Hozircha birorta o&apos;quvchi biriktirilmagan
            </p>
          </div>
        ) : (
          <>
            {atRisk.length > 0 && (
              <>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide px-1 mt-2 mb-1">
                  ⚠️ Diqqat talab qiladi
                </p>
                {atRisk.map((person) => (
                  <PersonCard key={person.id} person={person} />
                ))}
              </>
            )}
            {onTrack.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mt-4 mb-1">
                  ✅ Jadvalda
                </p>
                {onTrack.map((person) => (
                  <PersonCard key={person.id} person={person} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
