"use client";

import Link from "next/link";
import { Clock, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { SessionStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatTime } from "@/lib/utils";
import type { Session } from "@/types";

interface TodaysSessionsProps {
  sessions: (Session & { training: { name: string; color: string } })[];
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
}

export function TodaysSessions({ sessions, onOpen, onClose }: TodaysSessionsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-blue-600" />
          <CardTitle>Today&apos;s Sessions</CardTitle>
        </div>
      </CardHeader>

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No sessions scheduled today</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: session.training?.color || "#3B82F6" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{session.training?.name}</p>
                <p className="text-xs text-gray-500">
                  Session {session.session_number} · {formatTime(session.session_time)}
                </p>
              </div>
              <SessionStatusBadge status={session.status} />
              <div className="flex gap-1">
                {session.status === "upcoming" && (
                  <Button size="sm" variant="primary" onClick={() => onOpen(session.id)}>
                    Open
                  </Button>
                )}
                {session.status === "open" && (
                  <Button size="sm" variant="danger" onClick={() => onClose(session.id)}>
                    Close
                  </Button>
                )}
                <Link href={`/trainings/${session.training_id}/sessions/${session.id}`}>
                  <Button size="sm" variant="ghost">
                    <ChevronRight size={14} />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
