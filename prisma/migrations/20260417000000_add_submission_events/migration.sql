-- CreateEnum
CREATE TYPE "SubmissionEventType" AS ENUM ('SUBMITTED', 'TEXT_EDITED', 'FILE_ADDED', 'FILE_DELETED', 'RESUBMITTED', 'GRADED', 'GRADE_EDITED', 'GRADE_DELETED');

-- CreateTable
CREATE TABLE "submission_events" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "event_type" "SubmissionEventType" NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_events_submission_id_idx" ON "submission_events"("submission_id");

-- AddForeignKey
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
