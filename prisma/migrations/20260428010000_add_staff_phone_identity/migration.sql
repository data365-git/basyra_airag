-- Add staff phone identity basics (idempotent)
ALTER TABLE "staff_users"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "StaffUser_phone_key" ON "staff_users"("phone");

CREATE TABLE IF NOT EXISTS "staff_telegram_links" (
    "id"                  TEXT NOT NULL,
    "staff_user_id"       TEXT NOT NULL,
    "telegram_user_id"    BIGINT NOT NULL,
    "chat_id"             BIGINT NOT NULL,
    "username"            TEXT,
    "first_name"          TEXT,
    "verified_phone"      TEXT,
    "verified_by_contact" BOOLEAN NOT NULL DEFAULT false,
    "linked_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_telegram_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_telegram_links_staff_user_id_key" ON "staff_telegram_links"("staff_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_telegram_links_telegram_user_id_key" ON "staff_telegram_links"("telegram_user_id");
CREATE INDEX IF NOT EXISTS "staff_telegram_links_chat_id_idx" ON "staff_telegram_links"("chat_id");
CREATE INDEX IF NOT EXISTS "staff_telegram_links_verified_phone_idx" ON "staff_telegram_links"("verified_phone");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_telegram_links_staff_user_id_fkey'
  ) THEN
    ALTER TABLE "staff_telegram_links"
      ADD CONSTRAINT "staff_telegram_links_staff_user_id_fkey"
      FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
