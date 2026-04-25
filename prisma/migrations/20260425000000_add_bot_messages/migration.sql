CREATE TABLE "bot_messages" (
    "id"             TEXT NOT NULL,
    "chat_id"        BIGINT NOT NULL,
    "participant_id" TEXT,
    "role"           TEXT NOT NULL,
    "content"        TEXT NOT NULL,
    "intent"         TEXT,
    "routed_to"      TEXT,
    "token_count"    INTEGER,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bot_messages_chat_id_created_at_idx" ON "bot_messages"("chat_id", "created_at");
