CREATE TABLE "long_answers" (
    "id"           TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "message_id"   TEXT,
    "participant_id" TEXT,
    "title"        TEXT        NOT NULL,
    "summary"      TEXT        NOT NULL,
    "body_md"      TEXT        NOT NULL,
    "view_count"   INTEGER     NOT NULL DEFAULT 0,
    "viewed_at"    TIMESTAMPTZ,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "long_answers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "long_answers_message_id_key" UNIQUE ("message_id"),
    CONSTRAINT "long_answers_message_id_fkey"
        FOREIGN KEY ("message_id") REFERENCES "bot_messages"("id") ON DELETE SET NULL,
    CONSTRAINT "long_answers_participant_id_fkey"
        FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL
);
