/** Page key used in hasPermission() — dot notation for sub-pages */
export type PermPage =
  | "trainings"
  | "participants"
  | "scanner"
  | "reports"
  | "settings.users"
  | "settings.roles"
  | "settings.categories"
  | "settings.translations";

/** Action used in hasPermission() */
export type PermAction = "view" | "create" | "edit" | "delete" | "export";

/** Granular permission object stored in DB */
export interface RolePermissions {
  trainings:    { view: boolean; create: boolean; edit: boolean; delete: boolean };
  participants: { view: boolean; create: boolean; edit: boolean; delete: boolean };
  scanner:      { view: boolean };
  reports:      { view: boolean; export: boolean };
  settings: {
    users:        { view: boolean; create: boolean; edit: boolean; delete: boolean };
    roles:        { view: boolean; create: boolean; edit: boolean; delete: boolean };
    categories:   { view: boolean; create: boolean; edit: boolean; delete: boolean };
    translations: { view: boolean; edit: boolean };
  };
}

export interface TrainingCategory {
  id: string;
  name_uz: string;
  name_ru: string | null;
  name_en: string | null;
  sort_order: number;
  created_at: string;
  training_count?: number;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_superadmin: boolean;
  permissions: RolePermissions;
  created_at: string;
  user_count?: number;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role_id: string | null;
  role: Role | null;
  is_active: boolean;
  created_at: string;
}

export interface Training {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  start_date: string;
  end_date: string;
  schedule_days: number[]; // e.g. [6] = Sat, [0, 6] = Sun + Sat
  schedule_time: string;
  status: "upcoming" | "active" | "completed";
  attendance_threshold: number;
  late_threshold_minutes?: number | null;
  category_id?: string | null;
  category?: TrainingCategory | null;
  created_by: string | null;
  created_at: string;
  trainers?: StaffUser[];
  participant_count?: number;
  session_count?: number;
  avg_attendance_rate?: number | null;
}

export interface Session {
  id: string;
  training_id: string;
  session_number: number;
  session_date: string;
  session_time: string;
  status: "upcoming" | "open" | "closed";
  created_at: string;
  training?: Training;
  present_count?: number;
  absent_count?: number;
  total_count?: number;
}

export interface Participant {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  qr_token: string;
  created_at: string;
  trainings?: Training[];
  attendance_rate?: number;
}

export interface TrainingParticipant {
  training_id: string;
  participant_id: string;
  enrolled_at: string;
  participant?: Participant;
  training?: Training;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  participant_id: string;
  status: "present" | "absent" | "late" | "excused";
  scanned_at: string | null;
  scanned_by: string | null;
  note: string | null;
  override_by: string | null;
  override_at: string | null;
  synced_from_offline: boolean;
  participant?: Participant;
  session?: Session;
  scanner?: StaffUser;
}

export interface AttendanceAudit {
  id: string;
  attendance_id: string;
  changed_by: string;
  old_status: string;
  new_status: string;
  reason: string | null;
  changed_at: string;
  staff?: StaffUser;
}

export type SessionState =
  | "upcoming"
  | "active"
  | "ended"
  | "cancelled"
  | "force_closed";

export interface ScanResult {
  type:
    | "success"
    | "late"
    | "queued_offline"    // saved to local queue — NOT yet confirmed by server
    | "already_recorded"
    | "already_scanned"   // legacy alias kept for backward compat
    | "not_enrolled"
    | "excused"
    | "not_started"
    | "window_closed"
    | "session_closed"    // legacy alias kept for backward compat
    | "session_cancelled"
    | "force_closed"
    | "unknown";
  participant?: Participant;
  message?: string;
  minutesLate?: number;
}

export interface SystemSetting {
  key: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
}

export interface PendingScan {
  id?: number;
  sessionId: string;
  qrToken: string;
  scannedAt: string;
  synced: boolean;
}

export interface DashboardStats {
  totalParticipants: number;
  totalTrainings: number;
  activeTrainings: number;
  avgAttendanceRate: number;
}

export interface ParticipantStats {
  trainingId: string;
  trainingName: string;
  totalSessions: number;
  attended: number;
  missed: number;
  excused: number;
  rate: number;
  streak: number;
}

export interface ReportFilter {
  trainingId?: string;
  participantId?: string;
  trainerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface HeatmapCell {
  participantId: string;
  participantName: string;
  sessionId: string;
  sessionDate: string;
  sessionNumber: number;
  status: "present" | "absent" | "late" | "excused" | "pending";
}

export const STATUS_COLORS: Record<string, string> = {
  present: "green",
  absent: "red",
  late: "yellow",
  excused: "blue",
  upcoming: "gray",
  open: "green",
  closed: "red",
  active: "green",
  completed: "gray",
};
