-- CreateTable: supervisors
CREATE TABLE "supervisors" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active"     BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supervisors_email_key" ON "supervisors"("email");

-- CreateTable: supervisor_assignments
CREATE TABLE "supervisor_assignments" (
    "id"             TEXT NOT NULL,
    "supervisor_id"  TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "training_id"    TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supervisor_assignments_supervisor_id_participant_id_training_id_key"
    ON "supervisor_assignments"("supervisor_id", "participant_id", "training_id");

-- CreateTable: supervisor_invites
CREATE TABLE "supervisor_invites" (
    "id"             TEXT NOT NULL,
    "supervisor_id"  TEXT NOT NULL,
    "token"          TEXT NOT NULL,
    "expires_at"     TIMESTAMP(3) NOT NULL,
    "used_at"        TIMESTAMP(3),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supervisor_invites_token_key" ON "supervisor_invites"("token");

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_supervisor_id_fkey"
    FOREIGN KEY ("supervisor_id") REFERENCES "supervisors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_training_id_fkey"
    FOREIGN KEY ("training_id") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supervisor_invites" ADD CONSTRAINT "supervisor_invites_supervisor_id_fkey"
    FOREIGN KEY ("supervisor_id") REFERENCES "supervisors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
