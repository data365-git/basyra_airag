"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, FileText, Trash2, Star, Pencil, X } from "lucide-react";
import { fmtUzDateTime } from "@/lib/dateFormat";

type EventType =
  | "SUBMITTED"
  | "TEXT_EDITED"
  | "FILE_ADDED"
  | "FILE_DELETED"
  | "RESUBMITTED"
  | "GRADED"
  | "GRADE_EDITED"
  | "GRADE_DELETED";

interface TimelineEvent {
  id:        string;
  eventType: EventType;
  actorName: string;
  actorRole: string;
  meta:      Record<string, unknown> | null;
  createdAt: string;
}

const EVENT_CONFIG: Record<EventType, { icon: string; label: string; colorCls: string }> = {
  SUBMITTED:     { icon: "📤", label: "Topshirildi",         colorCls: "bg-blue-100 text-blue-700"   },
  TEXT_EDITED:   { icon: "📝", label: "Matn o'zgartirildi",  colorCls: "bg-gray-100 text-gray-700"   },
  FILE_ADDED:    { icon: "📎", label: "Fayl qo'shildi",      colorCls: "bg-indigo-100 text-indigo-700"},
  FILE_DELETED:  { icon: "🗑️", label: "Fayl o'chirildi",     colorCls: "bg-red-100 text-red-700"     },
  RESUBMITTED:   { icon: "🔄", label: "Qayta topshirildi",   colorCls: "bg-blue-100 text-blue-700"   },
  GRADED:        { icon: "⭐", label: "Baholandi",           colorCls: "bg-green-100 text-green-700" },
  GRADE_EDITED:  { icon: "✏️", label: "Baho o'zgartirildi", colorCls: "bg-amber-100 text-amber-700" },
  GRADE_DELETED: { icon: "❌", label: "Baho o'chirildi",    colorCls: "bg-red-100 text-red-700"     },
};

function metaDetail(eventType: EventType, meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  if (eventType === "GRADED")       return `${meta.score}/${meta.maxScore}`;
  if (eventType === "GRADE_EDITED") return `${meta.oldScore} → ${meta.newScore}`;
  if (eventType === "FILE_ADDED" || eventType === "FILE_DELETED") {
    const size = meta.size ? ` (${Math.round(Number(meta.size) / 1024)} KB)` : "";
    return `${meta.filename}${size}`;
  }
  if (eventType === "TEXT_EDITED" && meta.text) return `"${String(meta.text).slice(0, 60)}…"`;
  return null;
}

interface SubmissionTimelineProps {
  hwId:         string;
  subId:        string;
  participantName: string;
  onClose:      () => void;
}

export function SubmissionTimeline({ hwId, subId, participantName, onClose }: SubmissionTimelineProps) {
  const [events,  setEvents]  = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/homeworks/${hwId}/submissions/${subId}/events`)
      .then((r) => r.json())
      .then((data) => {
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [hwId, subId]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/40 flex justify-end"
      onClick={onClose}
    >
      {/* Drawer */}
      <div
        className="bg-white h-full w-full max-w-sm shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{participantName}</p>
            <p className="text-xs text-gray-400 mt-0.5">Topshiriq tarixi</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Timeline body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="animate-spin text-blue-400" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              Hali hech qanday tarix yo&apos;q
            </div>
          ) : (
            <ol className="relative border-l border-gray-200 space-y-6 ml-3">
              {events.map((ev) => {
                const cfg = EVENT_CONFIG[ev.eventType] ?? {
                  icon: "•", label: ev.eventType, colorCls: "bg-gray-100 text-gray-700",
                };
                const detail = metaDetail(ev.eventType, ev.meta);
                return (
                  <li key={ev.id} className="ml-5">
                    {/* Dot */}
                    <span
                      className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full text-[11px] ring-4 ring-white ${cfg.colorCls}`}
                    >
                      {cfg.icon}
                    </span>

                    <div>
                      <p className="text-sm font-medium text-gray-800 leading-snug">
                        {cfg.label}
                        {detail && (
                          <span className="ml-1.5 font-normal text-gray-500 text-xs">{detail}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtUzDateTime(ev.createdAt)}{" · "}
                        <span className="text-gray-500">{ev.actorName}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
