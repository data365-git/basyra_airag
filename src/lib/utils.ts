import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, startOfDay } from "date-fns";

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format an array of day indices into a human-readable string.
 *  [6] → "Saturday"
 *  [0, 6] → "Sunday & Saturday"
 *  [1, 3, 5] → "Mon, Wed, Fri"
 */
export function formatScheduleDays(days: number[]): string {
  if (!days || days.length === 0) return "—";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 1) return DAYS_OF_WEEK[sorted[0]];
  if (sorted.length === 2) return `${DAYS_OF_WEEK[sorted[0]]} & ${DAYS_OF_WEEK[sorted[1]]}`;
  return sorted.map((d) => DAYS_SHORT[d]).join(", ");
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = "MMM d, yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

export function getAttendanceColor(rate: number): string {
  if (rate >= 80) return "green";
  if (rate >= 60) return "yellow";
  return "red";
}

export function getAttendanceColorClass(rate: number): string {
  if (rate >= 80) return "text-green-600 bg-green-50";
  if (rate >= 60) return "text-yellow-600 bg-yellow-50";
  return "text-red-600 bg-red-50";
}

export function generateSessionDates(
  startDate: string,
  endDate: string,
  scheduleDays: number[] // e.g. [6] = Saturday, [0, 6] = Sunday + Saturday
): Date[] {
  if (!scheduleDays || scheduleDays.length === 0) return [];

  const start = startOfDay(parseISO(startDate));
  const end = startOfDay(parseISO(endDate));
  const daySet = new Set(scheduleDays);
  const result: Date[] = [];

  // Walk day-by-day from start to end, collect every day whose weekday is in the set
  let current = new Date(start);
  while (current <= end) {
    if (daySet.has(current.getDay())) {
      result.push(new Date(current));
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  // Already in chronological order; return sorted just to be explicit
  return result.sort((a, b) => a.getTime() - b.getTime());
}

export function trainingStatus(startDate: string, endDate: string): "upcoming" | "active" | "completed" {
  const now = new Date();
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (now < start) return "upcoming";
  if (now > end) return "completed";
  return "active";
}

export function attendanceStatusIcon(status: string): string {
  switch (status) {
    case "present": return "✅";
    case "absent": return "❌";
    case "late": return "⏰";
    case "excused": return "🔵";
    default: return "—";
  }
}

export function attendanceStatusColor(status: string): string {
  switch (status) {
    case "present": return "text-green-700 bg-green-100";
    case "absent": return "text-red-700 bg-red-100";
    case "late": return "text-yellow-700 bg-yellow-100";
    case "excused": return "text-blue-700 bg-blue-100";
    default: return "text-gray-500 bg-gray-100";
  }
}
