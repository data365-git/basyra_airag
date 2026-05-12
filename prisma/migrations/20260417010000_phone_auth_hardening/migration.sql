-- AlterTable: Participant — add auth-hardening columns
ALTER TABLE "participants"
  ADD COLUMN IF NOT EXISTS "is_blocked"         BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blocked_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "blocked_reason"     TEXT,
  ADD COLUMN IF NOT EXISTS "last_seen_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "phone_verified_at"  TIMESTAMP(3);

-- AlterTable: TelegramLink — verified_phone + verified_by_contact
ALTER TABLE "telegram_links"
  ADD COLUMN IF NOT EXISTS "verified_phone"       TEXT,
  ADD COLUMN IF NOT EXISTS "verified_by_contact"  BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: BotAuthLog
CREATE TABLE IF NOT EXISTS "bot_auth_log" (
    "id"               TEXT        NOT NULL,
    "telegram_user_id" BIGINT      NOT NULL,
    "chat_id"          BIGINT      NOT NULL,
    "phone"            TEXT,
    "event"            TEXT        NOT NULL,
    "meta"             JSONB,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_auth_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_auth_log_telegram_user_id_idx" ON "bot_auth_log"("telegram_user_id");
CREATE INDEX IF NOT EXISTS "bot_auth_log_phone_idx" ON "bot_auth_log"("phone");
