export type Permission =
  | "view_trainings"
  | "manage_trainings"
  | "manage_participants"
  | "scan_qr"
  | "view_reports"
  | "manage_users";

export interface Role {
  id: string;
  name: string;
  permissions: Record<Permission, boolean>;
  created_at: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
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
  schedule_day: number; // 0=Sun ... 6=Sat
  schedule_time: string;
  status: "upcoming" | "active" | "completed";
  attendance_threshold: number;
  created_by: string | null;
  created_at: string;
  trainers?: StaffUser[];
  participant_count?: number;
  session_count?: number;
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

export interface ScanResult {
  type: "success" | "already_scanned" | "not_enrolled" | "unknown" | "session_closed";
  participant?: Participant;
  message?: string;
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
