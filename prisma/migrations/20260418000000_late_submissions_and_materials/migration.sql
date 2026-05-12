-- ── Part 1: Late submission columns ──────────────────────────────────────────

-- AlterTable: Homework
ALTER TABLE "homeworks"
  ADD COLUMN IF NOT EXISTS "allow_late_submission" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "hard_close_at"         TEXT,
  ADD COLUMN IF NOT EXISTS "late_penalty_percent"  INTEGER;

-- AlterTable: HomeworkSubmission
ALTER TABLE "homework_submissions"
  ADD COLUMN IF NOT EXISTS "is_late"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "late_by_days" INTEGER;

-- AlterEnum: SubmissionEventType — add SUBMITTED_LATE and RESUBMITTED_LATE
ALTER TYPE "SubmissionEventType" ADD VALUE IF NOT EXISTS 'SUBMITTED_LATE';
ALTER TYPE "SubmissionEventType" ADD VALUE IF NOT EXISTS 'RESUBMITTED_LATE';

-- ── Part 2: Instructional materials ──────────────────────────────────────────

-- CreateEnum: HomeworkMaterialKind
DO $$ BEGIN
  CREATE TYPE "HomeworkMaterialKind" AS ENUM ('PDF','VIDEO','AUDIO','IMAGE','DOCUMENT','LINK');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable: HomeworkMaterial
CREATE TABLE IF NOT EXISTS "homework_materials" (
    "id"              TEXT         NOT NULL,
    "homework_id"     TEXT         NOT NULL,
    "kind"            "HomeworkMaterialKind" NOT NULL,
    "title"           TEXT         NOT NULL,
    "description"     TEXT,
    "storage_url"     TEXT,
    "file_name"       TEXT,
    "file_size_bytes" INTEGER,
    "mime_type"       TEXT,
    "url"             TEXT,
    "sort_order"      INTEGER      NOT NULL DEFAULT 0,
    "created_by"      TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "homework_materials_homework_id_idx" ON "homework_materials"("homework_id");

-- AddForeignKey
ALTER TABLE "homework_materials"
  ADD CONSTRAINT "homework_materials_homework_id_fkey"
  FOREIGN KEY ("homework_id") REFERENCES "homeworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "homework_materials"
  ADD CONSTRAINT "homework_materials_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
