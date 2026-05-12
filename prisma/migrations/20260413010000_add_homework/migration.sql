-- CreateTable: homeworks
CREATE TABLE "homeworks" (
    "id"          TEXT NOT NULL,
    "training_id" TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "due_date"    TEXT,
    "max_score"   INTEGER NOT NULL DEFAULT 100,
    "created_by"  TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "homeworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: homework_submissions
CREATE TABLE "homework_submissions" (
    "id"             TEXT NOT NULL,
    "homework_id"    TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "text"           TEXT,
    "submitted_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: homework_grades
CREATE TABLE "homework_grades" (
    "id"            TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "score"         INTEGER NOT NULL,
    "feedback"      TEXT,
    "graded_by"     TEXT,
    "graded_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "homework_grades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_homework_id_participant_id_key" ON "homework_submissions"("homework_id", "participant_id");
CREATE UNIQUE INDEX "homework_grades_submission_id_key" ON "homework_grades"("submission_id");

-- AddForeignKey
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homeworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "homework_grades" ADD CONSTRAINT "homework_grades_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework_grades" ADD CONSTRAINT "homework_grades_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
