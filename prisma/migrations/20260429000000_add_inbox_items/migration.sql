-- CreateTable
CREATE TABLE "inbox_items" (
    "id" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "participant_id" TEXT,
    "source_message_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "classifier_score" DOUBLE PRECISION,
    "assigned_to" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_items_kind_status_idx" ON "inbox_items"("kind", "status");

-- CreateIndex
CREATE INDEX "inbox_items_chat_id_idx" ON "inbox_items"("chat_id");

-- CreateIndex
CREATE INDEX "inbox_items_participant_id_idx" ON "inbox_items"("participant_id");

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
