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
  scheduleDay: number // 0=Sun, 1=Mon ... 6=Sat
): Date[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  // Find all occurrences of the day of week between start and end
  const days: Date[] = [];

  // Get the first occurrence of the target day on or after start
  let current = startOfDay(start);
  const targetDayOfWeek = scheduleDay; // 0=Sun

  // Find first occurrence
  while (current.getDay() !== targetDayOfWeek) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  while (current <= end) {
    if (current >= start) {
      days.push(new Date(current));
    }
    current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  return days;
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
