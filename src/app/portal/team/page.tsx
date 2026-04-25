"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Users } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttendanceSummary {
  present: number;
  late:    number;
  absent:  number;
  total:   number;
}

interface TeamMember {
  link_id:     string;
  participant: {
    id:                 string;
    full_name:          string;
    phone:              string;
    trainings:          Array<{ id: string; name: string; color: string }>;
    attendance_summary: AttendanceSummary;
  };
}

// ─── Portal fetch helper ──────────────────────────────────────────────────────

function portalFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("portal_token")
    : null;
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ─── Attendance bar ───────────────────────────────────────────────────────────

function AttendanceBar({ summary }: { summary: AttendanceSummary }) {
  const { present, late, absent, total } = summary;
  if (total === 0) {
    return <p className="text-xs text-gray-400 italic">Davomat yo&apos;q</p>;
  }
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="space-y-1.5">
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-gray-100">
        {present > 0 && (
          <div className="bg-green-500 h-full" style={{ width: pct(present) }} />
        )}
        {late > 0 && (
          <div className="bg-amber-400 h-full" style={{ width: pct(late) }} />
        )}
        {absent > 0 && (
          <div className="bg-red-400 h-full" style={{ width: pct(absent) }} />
        )}
      </div>
      <div className="flex gap-3 text-xs text-gray-500">
        <span className="text-green-600 font-medium">{present} keldi</span>
        {late > 0 && <span className="text-amber-600 font-medium">{late} kech</span>}
        <span className="text-red-500 font-medium">{absent} kelmadi</span>
        <span className="ml-auto text-gray-400">{total} jami</span>
      </div>
    </div>
  );
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({ member }: { member: TeamMember }) {
  const p = member.participant;
  const initials = p.full_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{p.full_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{p.phone}</p>
        </div>
      </div>

      {p.trainings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.trainings.map((tr) => (
            <span
              key={tr.id}
              className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
              style={{ background: tr.color || "#3B82F6" }}
            >
              {tr.name}
            </span>
          ))}
        </div>
      )}

      <AttendanceBar summary={p.attendance_summary} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const router  = useRouter();
  const [team,    setTeam]    = useState<TeamMember[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await portalFetch("/api/portal/team");
      if (res.status === 401) {
        router.replace("/portal/login");
        return;
      }
      if (res.ok) {
        setTeam(await res.json());
      }
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => router.push("/portal/me")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Ortga
        </button>
        <div className="flex items-center gap-2 ml-1">
          <Users size={16} className="text-blue-500" />
          <p className="text-sm font-semibold text-gray-900">Mening jamoam</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-3">
        {!team || team.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
            <Users size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-600">Sizning jamoangiz yo&apos;q</p>
          </div>
        ) : (
          team.map((member) => (
            <MemberCard key={member.link_id} member={member} />
          ))
        )}
      </div>
    </div>
  );
}
