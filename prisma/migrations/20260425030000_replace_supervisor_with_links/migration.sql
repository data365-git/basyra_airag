-- Drop old supervisor tables (cascade removes all FKs automatically)
DROP TABLE IF EXISTS "supervisor_invites" CASCADE;
DROP TABLE IF EXISTS "supervisor_assignments" CASCADE;
DROP TABLE IF EXISTS "supervisors" CASCADE;

-- Create the new supervisor_links join table
CREATE TABLE "supervisor_links" (
    "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "boss_id"     TEXT        NOT NULL,
    "report_id"   TEXT        NOT NULL,
    "training_id" TEXT,
    "created_by"  TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supervisor_links_boss_id_fkey"
        FOREIGN KEY ("boss_id")     REFERENCES "participants"("id") ON DELETE CASCADE,
    CONSTRAINT "supervisor_links_report_id_fkey"
        FOREIGN KEY ("report_id")   REFERENCES "participants"("id") ON DELETE CASCADE,
    CONSTRAINT "supervisor_links_training_id_fkey"
        FOREIGN KEY ("training_id") REFERENCES "trainings"("id")    ON DELETE CASCADE,
    CONSTRAINT "supervisor_links_created_by_fkey"
        FOREIGN KEY ("created_by")  REFERENCES "staff_users"("id"),
    CONSTRAINT "supervisor_links_boss_id_report_id_training_id_key"
        UNIQUE ("boss_id", "report_id", "training_id")
);
