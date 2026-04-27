-- Add username column to staff_users
ALTER TABLE "staff_users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "StaffUser_username_key" ON "staff_users"("username");

-- Make email nullable
ALTER TABLE "staff_users" ALTER COLUMN "email" DROP NOT NULL;
