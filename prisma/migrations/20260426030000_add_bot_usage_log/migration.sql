-- CreateTable
CREATE TABLE "bot_usage_log" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "participant_id" TEXT,
    "chat_id" BIGINT NOT NULL,
    "model" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "response_time_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_usage_log_chat_id_created_at_idx" ON "bot_usage_log"("chat_id", "created_at");

-- CreateIndex
CREATE INDEX "bot_usage_log_kind_created_at_idx" ON "bot_usage_log"("kind", "created_at");

-- CreateIndex
CREATE INDEX "bot_usage_log_created_at_idx" ON "bot_usage_log"("created_at");
