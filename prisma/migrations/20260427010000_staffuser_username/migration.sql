-- Add username column to StaffUser
ALTER TABLE "StaffUser" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "StaffUser_username_key" ON "StaffUser"("username");

-- Make email nullable
ALTER TABLE "StaffUser" ALTER COLUMN "email" DROP NOT NULL;
