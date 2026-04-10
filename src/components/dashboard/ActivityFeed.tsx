import { CheckCircle, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";

interface ActivityItem {
  id: string;
  participant_id: string;
  scanned_at: string | null;
  participant: { full_name: string };
  session: { session_number: number; training: { name: string; color: string } };
}

export function ActivityFeed({ activities }: { activities: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-green-600" />
          <CardTitle>Recent Scans</CardTitle>
        </div>
      </CardHeader>

      {activities.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No recent scan activity</p>
      ) : (
        <div className="space-y-2">
          {activities.slice(0, 10).map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.session?.training?.color || "#3B82F6" }}
              />
              <CheckCircle size={14} className="text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">
                  <span className="font-medium">{item.participant?.full_name}</span>
                  <span className="text-gray-500"> · {item.session?.training?.name}</span>
                </p>
                <p className="text-xs text-gray-400">
                  Session {item.session?.session_number} · {item.scanned_at ? formatDate(item.scanned_at, "h:mm a") : "—"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
