-- AlterTable sessions: add boolean state flags + indexes
ALTER TABLE "sessions"
  ADD COLUMN "is_cancelled"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "force_closed"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "cancelled_at"     TIMESTAMP(3),
  ADD COLUMN "cancelled_by"     TEXT,
  ADD COLUMN "force_closed_at"  TIMESTAMP(3),
  ADD COLUMN "force_closed_by"  TEXT;

CREATE INDEX IF NOT EXISTS "sessions_session_date_idx" ON "sessions"("session_date");

-- AlterTable trainings: per-training scan window overrides (null = use system default)
ALTER TABLE "trainings"
  ADD COLUMN "scan_window_before" INTEGER,
  ADD COLUMN "scan_window_after"  INTEGER;

-- AlterTable attendance: add method ("qr" | "manual")
ALTER TABLE "attendance"
  ADD COLUMN "method" TEXT NOT NULL DEFAULT 'qr';

-- Seed new system settings (scan window defaults + timezone)
INSERT INTO "system_settings" ("key", "value", "updated_at")
VALUES
  ('scan_window_before_minutes', '30',             NOW()),
  ('scan_window_after_minutes',  '120',            NOW()),
  ('timezone',                   'Asia/Tashkent',  NOW())
ON CONFLICT ("key") DO NOTHING;
