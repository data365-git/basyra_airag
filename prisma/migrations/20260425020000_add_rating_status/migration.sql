ALTER TABLE "bot_message_ratings" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "bot_message_ratings" ADD COLUMN IF NOT EXISTS "curated_by" TEXT;
ALTER TABLE "bot_message_ratings" ADD COLUMN IF NOT EXISTS "curated_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "bot_message_ratings_status_idx" ON "bot_message_ratings"("status");
