-- AlterTable: add late_threshold_minutes to trainings
ALTER TABLE "trainings" ADD COLUMN "late_threshold_minutes" INTEGER;

-- CreateTable: system_settings
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- Seed default late threshold
INSERT INTO "system_settings" ("key", "value", "updated_at")
VALUES ('late_threshold_minutes', '15', NOW())
ON CONFLICT ("key") DO NOTHING;
