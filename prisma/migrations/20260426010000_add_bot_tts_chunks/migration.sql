CREATE TABLE "bot_tts_chunks" (
    "id"         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "message_id" TEXT        NOT NULL,
    "idx"        INTEGER     NOT NULL,
    "file_id"    TEXT        NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_tts_chunks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bot_tts_chunks_message_id_fkey"
        FOREIGN KEY ("message_id") REFERENCES "bot_messages"("id") ON DELETE CASCADE,
    CONSTRAINT "bot_tts_chunks_message_id_idx_key"
        UNIQUE ("message_id", "idx")
);
