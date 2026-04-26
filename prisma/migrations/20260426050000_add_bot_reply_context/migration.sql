ALTER TABLE "telegram_messages"
ADD COLUMN IF NOT EXISTS "reply_to_telegram_msg_id" INTEGER;

ALTER TABLE "bot_messages"
ADD COLUMN IF NOT EXISTS "telegram_msg_id" INTEGER,
ADD COLUMN IF NOT EXISTS "reply_to_telegram_msg_id" INTEGER,
ADD COLUMN IF NOT EXISTS "reply_to_message_id" TEXT,
ADD COLUMN IF NOT EXISTS "metadata" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bot_messages_reply_to_message_id_fkey'
  ) THEN
    ALTER TABLE "bot_messages"
    ADD CONSTRAINT "bot_messages_reply_to_message_id_fkey"
    FOREIGN KEY ("reply_to_message_id") REFERENCES "bot_messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "telegram_messages_chat_id_telegram_msg_id_idx"
ON "telegram_messages"("chat_id", "telegram_msg_id");

CREATE INDEX IF NOT EXISTS "bot_messages_chat_id_telegram_msg_id_idx"
ON "bot_messages"("chat_id", "telegram_msg_id");

CREATE INDEX IF NOT EXISTS "bot_messages_chat_id_reply_to_telegram_msg_id_idx"
ON "bot_messages"("chat_id", "reply_to_telegram_msg_id");

CREATE INDEX IF NOT EXISTS "bot_messages_reply_to_message_id_idx"
ON "bot_messages"("reply_to_message_id");
