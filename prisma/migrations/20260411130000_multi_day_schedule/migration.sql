-- Migration: multi-day schedule
-- Replaces schedule_day (Int) with schedule_days (Int[]) on trainings table.
-- Existing rows are backfilled: their single day is wrapped into a 1-element array.

-- 1. Add new column (nullable first so existing rows don't fail the NOT NULL check)
ALTER TABLE "trainings" ADD COLUMN "schedule_days" INTEGER[] DEFAULT '{}';

-- 2. Backfill: wrap the old single value into an array
UPDATE "trainings" SET "schedule_days" = ARRAY["schedule_day"];

-- 3. Set NOT NULL now that every row is populated
ALTER TABLE "trainings" ALTER COLUMN "schedule_days" SET NOT NULL;

-- 4. Drop the old column
ALTER TABLE "trainings" DROP COLUMN "schedule_day";
