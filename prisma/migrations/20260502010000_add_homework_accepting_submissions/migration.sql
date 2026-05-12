-- Add explicit homework submission open/closed state.
ALTER TABLE "homeworks"
  ADD COLUMN IF NOT EXISTS "accepting_submissions" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "closed_at"              TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closed_by_id"           TEXT,
  ADD COLUMN IF NOT EXISTS "reopened_at"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reopened_by_id"         TEXT;

CREATE INDEX IF NOT EXISTS "homeworks_closed_by_id_idx" ON "homeworks"("closed_by_id");
CREATE INDEX IF NOT EXISTS "homeworks_reopened_by_id_idx" ON "homeworks"("reopened_by_id");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'homeworks_closed_by_id_fkey'
  ) THEN
    ALTER TABLE "homeworks"
      ADD CONSTRAINT "homeworks_closed_by_id_fkey"
      FOREIGN KEY ("closed_by_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'homeworks_reopened_by_id_fkey'
  ) THEN
    ALTER TABLE "homeworks"
      ADD CONSTRAINT "homeworks_reopened_by_id_fkey"
      FOREIGN KEY ("reopened_by_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
