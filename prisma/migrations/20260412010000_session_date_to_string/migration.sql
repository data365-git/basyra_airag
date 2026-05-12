-- Migration: session_date DATE → TEXT
--
-- Root cause: Session dates were stored as PostgreSQL DATE (UTC midnight).
-- Dates created at local-midnight Tashkent (UTC+5) were offset by 5 hours,
-- causing the UTC date to land on the previous day (e.g. April 12 Tashkent
-- → April 11 19:00 UTC → stored as DATE "2026-04-11").
--
-- Fix: Convert the stored DATE to a plain TEXT "YYYY-MM-DD" string using
-- Asia/Tashkent timezone so existing data is corrected in place.

-- 1. Add temporary text column
ALTER TABLE "sessions" ADD COLUMN "session_date_text" TEXT;

-- 2. Populate with Tashkent-correct date string
UPDATE "sessions"
SET "session_date_text" = TO_CHAR(
  "session_date" AT TIME ZONE 'Asia/Tashkent',
  'YYYY-MM-DD'
);

-- 3. Swap columns
ALTER TABLE "sessions" DROP COLUMN "session_date";
ALTER TABLE "sessions" RENAME COLUMN "session_date_text" TO "session_date";
ALTER TABLE "sessions" ALTER COLUMN "session_date" SET NOT NULL;

-- 4. Recreate index on new TEXT column
DROP INDEX IF EXISTS "sessions_session_date_idx";
CREATE INDEX "sessions_session_date_idx" ON "sessions"("session_date");
