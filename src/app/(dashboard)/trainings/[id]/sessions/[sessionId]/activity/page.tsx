"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loader2, Zap, Save } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import toast from "react-hot-toast";

interface Participant {
  id:        string;
  full_name: string;
}

interface ScoreRow {
  participantId: string;
  full_name:     string;
  score:         string; // string input for controlled input
  note:          string;
  saved:         boolean; // has an existing DB score
}

export default function ActivityScoringPage() {
  const { id: trainingId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const canManage = usePermission("trainings", "edit");

  const [rows,      setRows]      = useState<ScoreRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ session_number: number; session_date: string } | null>(null);

  useEffect(() => { load(); }, [sessionId]);

  async function load() {
    setLoading(true);
    const [sessRes, participantsRes, scoresRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}`).then((r) => r.json()),
      fetch(`/api/participants?training_id=${trainingId}`).then((r) => r.json()),
      fetch(`/api/activity?sessionId=${sessionId}`).then((r) => r.json()),
    ]);

    setSessionInfo(sessRes?.session_number != null ? {
      session_number: sessRes.session_number,
      session_date:   sessRes.session_date,
    } : null);

    const participants: Participant[] = Array.isArray(participantsRes) ? participantsRes : [];
    const scores: Array<{ participantId: string; score: number; note: string | null }> =
      Array.isArray(scoresRes) ? scoresRes : [];

    const scoreMap = new Map(scores.map((s) => [s.participantId, s]));

    setRows(
      participants.map((p) => {
        const existing = scoreMap.get(p.id);
        return {
          participantId: p.id,
          full_name:     p.full_name,
          score:         existing ? String(existing.score) : "",
          note:          existing?.note ?? "",
          saved:         !!existing,
        };
      })
    );
    setLoading(false);
  }

  function updateRow(id: string, field: "score" | "note", value: string) {
    setRows((prev) =>
      prev.map((r) => (r.participantId === id ? { ...r, [field]: value } : r))
    );
  }

  async function saveAll() {
    const toSave = rows.filter((r) => r.score !== "" && !isNaN(Number(r.score)));
    if (toSave.length === 0) {
      toast.error("Hech qanday ball kiritilmagan");
      return;
    }

    setSaving(true);
    let saved = 0;
    let failed = 0;

    await Promise.all(
      toSave.map(async (r) => {
        const score = Math.min(100, Math.max(0, Math.round(Number(r.score))));
        const res = await fetch("/api/activity", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            sessionId,
            participantId: r.participantId,
            score,
            note: r.note.trim() || null,
          }),
        });
        if (res.ok) saved++; else failed++;
      })
    );

    setSaving(false);
    if (failed === 0) {
      toast.success(`${saved} ta ball saqlandi`);
      await load();
    } else {
      toast.error(`${failed} ta saqlashda xato`);
    }
  }

  async function clearScore(participantId: string) {
    const res = await fetch(
      `/api/activity?sessionId=${sessionId}&participantId=${participantId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setRows((prev) =>
        prev.map((r) =>
          r.participantId === participantId ? { ...r, score: "", note: "", saved: false } : r
        )
      );
    } else {
      toast.error("O'chirishda xato");
    }
  }

  function fillAll(value: string) {
    setRows((prev) => prev.map((r) => ({ ...r, score: value })));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={28} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faollik ballari"
        subtitle={
          sessionInfo
            ? `Sessiya ${sessionInfo.session_number} · ${sessionInfo.session_date}`
            : "Sessiya faollik ballari"
        }
        back
        backHref={`/trainings/${trainingId}/sessions/${sessionId}`}
        actions={
          canManage ? (
            <Button size="sm" onClick={saveAll} loading={saving}>
              <Save size={14} /> Barchasini saqlash
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap size={16} className="text-amber-500" />
            Ishtirokchilar ({rows.length})
          </CardTitle>
          {canManage && rows.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Barchaga:</span>
              {[100, 90, 80, 70].map((v) => (
                <button
                  key={v}
                  onClick={() => fillAll(String(v))}
                  className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                >
                  {v}
                </button>
              ))}
              <button
                onClick={() => fillAll("")}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-red-100 hover:text-red-600 transition-colors"
              >
                Tozalash
              </button>
            </div>
          )}
        </CardHeader>

        {rows.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            Bu kursda ishtirokchilar yo&apos;q
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {rows.map((r) => (
              <div key={r.participantId} className="flex items-center gap-4 px-5 py-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-amber-600">
                    {r.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{r.full_name}</p>
                  {r.saved && (
                    <p className="text-xs text-green-600">✓ Saqlangan</p>
                  )}
                </div>

                {/* Score input */}
                {canManage ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={r.score}
                        onChange={(e) => updateRow(r.participantId, "score", e.target.value)}
                        placeholder="—"
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <span className="text-gray-400 text-xs">/100</span>
                    <input
                      type="text"
                      value={r.note}
                      onChange={(e) => updateRow(r.participantId, "note", e.target.value)}
                      placeholder="Izoh"
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {r.saved && (
                      <button
                        onClick={() => clearScore(r.participantId)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                        title="O'chirish"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="shrink-0 text-right">
                    {r.score !== "" ? (
                      <span className="text-sm font-bold text-amber-600">{r.score}<span className="text-gray-400 font-normal">/100</span></span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage && rows.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-50">
            <Button onClick={saveAll} loading={saving} className="w-full sm:w-auto">
              <Save size={14} /> Barchasini saqlash
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
