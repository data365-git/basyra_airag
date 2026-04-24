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
  id:        string;
  name:      string;
  trainings: Training[];
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
        setPeople(data.people ?? []);
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
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
            <ShieldCheck size={18} className="text-indigo-600" />
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
          people.map((person) => (
            <div
              key={person.id}
              onClick={() => router.push(`/supervisor/people/${person.id}`)}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
            >
              <p className="font-semibold text-gray-900">{person.name}</p>
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
          ))
        )}
      </div>
    </div>
  );
}
