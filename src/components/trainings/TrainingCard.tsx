import Link from "next/link";
import { Users, Calendar, ChevronRight } from "lucide-react";
import { TrainingStatusBadge } from "@/components/ui/Badge";
import { formatDate, formatTime, formatScheduleDays } from "@/lib/utils";
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
            <span>Every {formatScheduleDays(training.schedule_days)} · {formatTime(training.schedule_time)}</span>
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

        {training.avg_attendance_rate != null && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-400">Avg attendance</span>
              <span
                className={
                  training.avg_attendance_rate >= 80
                    ? "text-green-600 font-medium"
                    : training.avg_attendance_rate >= 60
                      ? "text-yellow-600 font-medium"
                      : "text-red-600 font-medium"
                }
              >
                {training.avg_attendance_rate}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  training.avg_attendance_rate >= 80
                    ? "bg-green-500"
                    : training.avg_attendance_rate >= 60
                      ? "bg-yellow-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${training.avg_attendance_rate}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
