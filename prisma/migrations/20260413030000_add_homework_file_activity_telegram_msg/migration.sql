-- HomeworkFile
CREATE TABLE "homework_files" (
    "id"               TEXT NOT NULL,
    "submission_id"    TEXT NOT NULL,
    "file_name"        TEXT NOT NULL,
    "file_type"        TEXT NOT NULL,
    "file_size_bytes"  INTEGER,
    "storage_url"      TEXT,
    "telegram_file_id" TEXT,
    "uploaded_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "homework_files_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "homework_files" ADD CONSTRAINT "homework_files_submission_id_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ActivityScore
CREATE TABLE "activity_scores" (
    "id"             TEXT NOT NULL,
    "session_id"     TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "score"          INTEGER NOT NULL,
    "note"           TEXT,
    "entered_by"     TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_scores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "activity_scores_session_id_participant_id_key" ON "activity_scores"("session_id","participant_id");
ALTER TABLE "activity_scores" ADD CONSTRAINT "activity_scores_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_scores" ADD CONSTRAINT "activity_scores_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_scores" ADD CONSTRAINT "activity_scores_entered_by_fkey"
    FOREIGN KEY ("entered_by") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TelegramMessage
CREATE TABLE "telegram_messages" (
    "id"               TEXT NOT NULL,
    "chat_id"          BIGINT NOT NULL,
    "participant_id"   TEXT,
    "direction"        TEXT NOT NULL,
    "text"             TEXT,
    "message_type"     TEXT NOT NULL DEFAULT 'text',
    "telegram_file_id" TEXT,
    "file_name"        TEXT,
    "file_size_bytes"  INTEGER,
    "telegram_msg_id"  INTEGER,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telegram_messages_chat_id_idx" ON "telegram_messages"("chat_id");
CREATE INDEX "telegram_messages_participant_id_idx" ON "telegram_messages"("participant_id");
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
