-- Add new columns to roles table
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "color" TEXT NOT NULL DEFAULT '#6366f1';
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "is_superadmin" BOOLEAN NOT NULL DEFAULT false;

-- Migrate Admin role to new granular permission format + mark as superadmin
UPDATE "roles" SET
  "permissions" = '{"trainings":{"view":true,"create":true,"edit":true,"delete":true},"participants":{"view":true,"create":true,"edit":true,"delete":true},"scanner":{"view":true},"reports":{"view":true,"export":true},"settings":{"users":{"view":true,"create":true,"edit":true,"delete":true},"roles":{"view":true,"create":true,"edit":true,"delete":true}}}',
  "color" = '#6366f1',
  "is_superadmin" = true,
  "description" = 'Full system access'
WHERE "name" = 'Admin';

-- Migrate Scanner role
UPDATE "roles" SET
  "permissions" = '{"trainings":{"view":true,"create":false,"edit":false,"delete":false},"participants":{"view":false,"create":false,"edit":false,"delete":false},"scanner":{"view":true},"reports":{"view":false,"export":false},"settings":{"users":{"view":false,"create":false,"edit":false,"delete":false},"roles":{"view":false,"create":false,"edit":false,"delete":false}}}',
  "color" = '#0ea5e9',
  "description" = 'Can scan QR codes and view trainings'
WHERE "name" = 'Scanner';

-- Migrate Viewer role
UPDATE "roles" SET
  "permissions" = '{"trainings":{"view":true,"create":false,"edit":false,"delete":false},"participants":{"view":false,"create":false,"edit":false,"delete":false},"scanner":{"view":false},"reports":{"view":true,"export":true},"settings":{"users":{"view":false,"create":false,"edit":false,"delete":false},"roles":{"view":false,"create":false,"edit":false,"delete":false}}}',
  "color" = '#10b981',
  "description" = 'Read-only access to trainings and reports'
WHERE "name" = 'Viewer';
