import Link from "next/link";
import { Users, Calendar, ChevronRight } from "lucide-react";
import { TrainingStatusBadge } from "@/components/ui/Badge";
import { formatDate, formatTime, DAYS_OF_WEEK } from "@/lib/utils";
import type { Training } from "@/types";

export function TrainingCard({ training }: { training: Training & { participant_count?: number; session_count?: number } }) {
  return (
    <Link href={`/trainings/${training.id}`}>
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-lg shrink-0"
            style={{ backgroundColor: training.color }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {training.name}
            </h3>
            {training.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{training.description}</p>
            )}
          </div>
          <TrainingStatusBadge status={training.status} />
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500 mt-3">
          <div className="flex items-center gap-1">
            <Calendar size={12} />
            <span>Every {DAYS_OF_WEEK[training.schedule_day]} · {formatTime(training.schedule_time)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
          <span>{formatDate(training.start_date)} — {formatDate(training.end_date)}</span>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <Users size={12} />
            <span>{training.participant_count || 0} participants</span>
          </div>
          <div className="text-xs text-gray-500 ml-auto flex items-center gap-1">
            {training.session_count || 0} sessions
            <ChevronRight size={12} className="text-gray-300" />
          </div>
        </div>
      </div>
    </Link>
  );
}
