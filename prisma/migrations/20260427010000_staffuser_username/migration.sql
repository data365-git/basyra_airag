-- Add username column to staff_users (idempotent)
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "username" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "StaffUser_username_key" ON "staff_users"("username");

-- Make email nullable (already idempotent in Postgres)
ALTER TABLE "staff_users" ALTER COLUMN "email" DROP NOT NULL;
