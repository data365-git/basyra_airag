-- CreateTable
CREATE TABLE "chatbot_broadcast_history" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "segment" TEXT NOT NULL,
    "training_id" TEXT,
    "total" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "error_summary" JSONB,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_broadcast_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chatbot_broadcast_history_created_at_idx" ON "chatbot_broadcast_history"("created_at");
