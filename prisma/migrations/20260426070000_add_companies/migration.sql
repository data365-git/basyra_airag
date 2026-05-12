CREATE TABLE IF NOT EXISTS "companies" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "company_employees" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "participant_id" TEXT NOT NULL,
  "training_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "company_supervisors" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "participant_id" TEXT NOT NULL,
  "role" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "access_token" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "company_supervisors_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "created_by" TEXT,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "companies" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "company_employees"
  ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "company_id" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "participant_id" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "training_id" TEXT,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "company_supervisors"
  ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "company_id" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "participant_id" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "role" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "access_token" TEXT,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "company_supervisors" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "companies_name_idx" ON "companies"("name");
CREATE INDEX IF NOT EXISTS "companies_status_idx" ON "companies"("status");

CREATE INDEX IF NOT EXISTS "company_employees_participant_id_idx" ON "company_employees"("participant_id");
CREATE INDEX IF NOT EXISTS "company_employees_training_id_idx" ON "company_employees"("training_id");
CREATE UNIQUE INDEX IF NOT EXISTS "company_employees_company_id_participant_id_training_id_key"
  ON "company_employees"("company_id", "participant_id", "training_id");
CREATE UNIQUE INDEX IF NOT EXISTS "company_employees_company_id_participant_id_no_training_key"
  ON "company_employees"("company_id", "participant_id")
  WHERE "training_id" IS NULL;

CREATE INDEX IF NOT EXISTS "company_supervisors_participant_id_idx" ON "company_supervisors"("participant_id");
CREATE INDEX IF NOT EXISTS "company_supervisors_status_idx" ON "company_supervisors"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "company_supervisors_company_id_participant_id_key"
  ON "company_supervisors"("company_id", "participant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "company_supervisors_access_token_key"
  ON "company_supervisors"("access_token");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"companies"'::regclass
      AND conname = 'companies_pkey'
  ) THEN
    ALTER TABLE "companies" ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"company_employees"'::regclass
      AND conname = 'company_employees_pkey'
  ) THEN
    ALTER TABLE "company_employees" ADD CONSTRAINT "company_employees_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"company_supervisors"'::regclass
      AND conname = 'company_supervisors_pkey'
  ) THEN
    ALTER TABLE "company_supervisors" ADD CONSTRAINT "company_supervisors_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"companies"'::regclass
      AND conname = 'companies_created_by_fkey'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "staff_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"company_employees"'::regclass
      AND conname = 'company_employees_company_id_fkey'
  ) THEN
    ALTER TABLE "company_employees"
      ADD CONSTRAINT "company_employees_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"company_employees"'::regclass
      AND conname = 'company_employees_participant_id_fkey'
  ) THEN
    ALTER TABLE "company_employees"
      ADD CONSTRAINT "company_employees_participant_id_fkey"
      FOREIGN KEY ("participant_id") REFERENCES "participants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"company_employees"'::regclass
      AND conname = 'company_employees_training_id_fkey'
  ) THEN
    ALTER TABLE "company_employees"
      ADD CONSTRAINT "company_employees_training_id_fkey"
      FOREIGN KEY ("training_id") REFERENCES "trainings"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"company_supervisors"'::regclass
      AND conname = 'company_supervisors_company_id_fkey'
  ) THEN
    ALTER TABLE "company_supervisors"
      ADD CONSTRAINT "company_supervisors_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"company_supervisors"'::regclass
      AND conname = 'company_supervisors_participant_id_fkey'
  ) THEN
    ALTER TABLE "company_supervisors"
      ADD CONSTRAINT "company_supervisors_participant_id_fkey"
      FOREIGN KEY ("participant_id") REFERENCES "participants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
