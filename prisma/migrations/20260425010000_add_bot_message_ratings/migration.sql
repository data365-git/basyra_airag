CREATE TABLE "bot_message_ratings" (
    "id"             TEXT NOT NULL,
    "message_id"     TEXT NOT NULL,
    "stars"          INTEGER NOT NULL,
    "reason"         TEXT,
    "comment"        TEXT,
    "participant_id" TEXT,
    "rated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bot_message_ratings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bot_message_ratings_message_id_key" ON "bot_message_ratings"("message_id");
CREATE INDEX "bot_message_ratings_stars_idx" ON "bot_message_ratings"("stars");
CREATE INDEX "bot_message_ratings_reason_idx" ON "bot_message_ratings"("reason");
ALTER TABLE "bot_message_ratings" ADD CONSTRAINT "bot_message_ratings_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "bot_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_message_ratings" ADD CONSTRAINT "bot_message_ratings_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
