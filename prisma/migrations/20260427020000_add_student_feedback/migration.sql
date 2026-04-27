-- CreateTable: student_feedback
-- Model StudentFeedback was added to schema.prisma without a migration file.
CREATE TABLE IF NOT EXISTS "student_feedback" (
    "id"            TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatId"        BIGINT NOT NULL,
    "participantId" TEXT,
    "category"      TEXT NOT NULL,
    "severity"      TEXT,
    "tags"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "messageText"   TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'new',
    "curatorNote"   TEXT,

    CONSTRAINT "student_feedback_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (optional — skip if participants table might not exist yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'student_feedback_participantId_fkey'
  ) THEN
    ALTER TABLE "student_feedback"
      ADD CONSTRAINT "student_feedback_participantId_fkey"
      FOREIGN KEY ("participantId") REFERENCES "participants"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
