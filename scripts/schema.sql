-- =========================================================
-- AttendTrack Database Schema
-- Run this in Supabase SQL Editor
-- =========================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- ROLES TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  permissions JSONB NOT NULL DEFAULT '{
    "view_trainings": false,
    "manage_trainings": false,
    "manage_participants": false,
    "scan_qr": false,
    "view_reports": false,
    "manage_users": false
  }',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- STAFF USERS TABLE (linked to auth.users)
-- =========================================================
CREATE TABLE IF NOT EXISTS staff_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- TRAININGS TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'book',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  schedule_day INTEGER NOT NULL CHECK (schedule_day >= 0 AND schedule_day <= 6),
  schedule_time TIME NOT NULL,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
  attendance_threshold INTEGER DEFAULT 80,
  created_by UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- TRAINING TRAINERS (many-to-many)
-- =========================================================
CREATE TABLE IF NOT EXISTS training_trainers (
  training_id UUID REFERENCES trainings(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_users(id) ON DELETE CASCADE,
  PRIMARY KEY (training_id, staff_id)
);

-- =========================================================
-- SESSIONS TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  session_number INTEGER NOT NULL,
  session_date DATE NOT NULL,
  session_time TIME NOT NULL,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(training_id, session_number)
);

-- =========================================================
-- PARTICIPANTS TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  photo_url TEXT,
  qr_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- TRAINING PARTICIPANTS (enrollment - many-to-many)
-- =========================================================
CREATE TABLE IF NOT EXISTS training_participants (
  training_id UUID REFERENCES trainings(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (training_id, participant_id)
);

-- =========================================================
-- ATTENDANCE TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  scanned_at TIMESTAMPTZ,
  scanned_by UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  note TEXT,
  override_by UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  override_at TIMESTAMPTZ,
  synced_from_offline BOOLEAN DEFAULT FALSE,
  UNIQUE(session_id, participant_id)
);

-- =========================================================
-- ATTENDANCE AUDIT LOG
-- =========================================================
CREATE TABLE IF NOT EXISTS attendance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID REFERENCES attendance(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  old_status TEXT,
  new_status TEXT,
  reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- INDEXES for performance
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_sessions_training ON sessions(training_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_participant ON attendance(participant_id);
CREATE INDEX IF NOT EXISTS idx_training_participants_training ON training_participants(training_id);
CREATE INDEX IF NOT EXISTS idx_training_participants_participant ON training_participants(participant_id);
CREATE INDEX IF NOT EXISTS idx_participants_qr_token ON participants(qr_token);

-- =========================================================
-- ROW LEVEL SECURITY (RLS)
-- =========================================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_audit ENABLE ROW LEVEL SECURITY;

-- Helper function: get current staff user
CREATE OR REPLACE FUNCTION current_staff_user()
RETURNS staff_users AS $$
  SELECT * FROM staff_users WHERE id = auth.uid() AND is_active = TRUE LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function: check permission
CREATE OR REPLACE FUNCTION has_permission(perm TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT (r.permissions->perm)::boolean
     FROM staff_users su
     JOIN roles r ON r.id = su.role_id
     WHERE su.id = auth.uid() AND su.is_active = TRUE),
    FALSE
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- ROLES policies
CREATE POLICY "roles_read" ON roles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "roles_write" ON roles FOR ALL TO authenticated USING (has_permission('manage_users'));

-- STAFF_USERS policies
CREATE POLICY "staff_users_read_own" ON staff_users FOR SELECT TO authenticated USING (id = auth.uid() OR has_permission('manage_users'));
CREATE POLICY "staff_users_write" ON staff_users FOR ALL TO authenticated USING (has_permission('manage_users'));
CREATE POLICY "staff_users_insert_self" ON staff_users FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- TRAININGS policies
CREATE POLICY "trainings_read" ON trainings FOR SELECT TO authenticated USING (has_permission('view_trainings') OR has_permission('manage_trainings') OR has_permission('scan_qr'));
CREATE POLICY "trainings_write" ON trainings FOR ALL TO authenticated USING (has_permission('manage_trainings'));

-- TRAINING_TRAINERS policies
CREATE POLICY "training_trainers_read" ON training_trainers FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "training_trainers_write" ON training_trainers FOR ALL TO authenticated USING (has_permission('manage_trainings'));

-- SESSIONS policies
CREATE POLICY "sessions_read" ON sessions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "sessions_write" ON sessions FOR ALL TO authenticated USING (has_permission('manage_trainings'));

-- PARTICIPANTS policies
CREATE POLICY "participants_read" ON participants FOR SELECT TO authenticated USING (has_permission('manage_participants') OR has_permission('scan_qr') OR has_permission('view_reports'));
CREATE POLICY "participants_write" ON participants FOR ALL TO authenticated USING (has_permission('manage_participants'));

-- TRAINING_PARTICIPANTS policies
CREATE POLICY "training_participants_read" ON training_participants FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "training_participants_write" ON training_participants FOR ALL TO authenticated USING (has_permission('manage_participants'));

-- ATTENDANCE policies
CREATE POLICY "attendance_read" ON attendance FOR SELECT TO authenticated USING (has_permission('view_reports') OR has_permission('manage_trainings') OR has_permission('scan_qr'));
CREATE POLICY "attendance_write" ON attendance FOR INSERT TO authenticated WITH CHECK (has_permission('scan_qr') OR has_permission('manage_trainings'));
CREATE POLICY "attendance_update" ON attendance FOR UPDATE TO authenticated USING (has_permission('manage_trainings'));

-- ATTENDANCE_AUDIT policies
CREATE POLICY "audit_read" ON attendance_audit FOR SELECT TO authenticated USING (has_permission('manage_trainings'));
CREATE POLICY "audit_write" ON attendance_audit FOR INSERT TO authenticated WITH CHECK (TRUE);
