"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface PortalMe {
  id:       string;
  name:     string;
  username: string;
  trainings: Array<{ id: string; name: string; color: string; status: string }>;
}

export default function PortalMePage() {
  const router = useRouter();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => {
        if (r.status === 401) { router.replace("/portal/login"); return null; }
        return r.json();
      })
      .then((data) => { if (data) setMe(data); })
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await fetch("/api/portal/logout", { method: "POST" });
    toast.success("Chiqildi");
    router.push("/portal/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!me) return null;

  const training = me.trainings[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
            <User size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">{me.name}</p>
            {training && (
              <p className="text-xs text-gray-500 leading-tight truncate max-w-[180px]">{training.name}</p>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
        >
          <LogOut size={15} />
          Chiqish
        </button>
      </div>

      {/* Content — scorecard coming in Phase 4 */}
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-gray-600">Shaxsiy statistika</p>
          <p className="text-sm mt-1">Tez orada mavjud bo'ladi</p>
        </div>
      </div>
    </div>
  );
}
