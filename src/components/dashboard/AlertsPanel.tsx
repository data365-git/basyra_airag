import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { getAttendanceColorClass } from "@/lib/utils";

interface Alert {
  participantId: string;
  participantName: string;
  trainingId: string;
  trainingName: string;
  rate: number;
  threshold: number;
}

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-yellow-600" />
          <CardTitle>Low Attendance Alerts</CardTitle>
        </div>
      </CardHeader>

      {alerts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">All participants above threshold</p>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 8).map((alert, i) => (
            <Link
              key={`${alert.participantId}-${alert.trainingId}-${i}`}
              href={`/participants/${alert.participantId}`}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <AlertTriangle size={14} className="text-yellow-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{alert.participantName}</p>
                <p className="text-xs text-gray-500 truncate">{alert.trainingName}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getAttendanceColorClass(alert.rate)}`}>
                {alert.rate}%
              </span>
              <ChevronRight size={14} className="text-gray-300" />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
