-- CreateTable: telegram_links
CREATE TABLE "telegram_links" (
    "id"             TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "chat_id"        BIGINT NOT NULL,
    "username"       TEXT,
    "first_name"     TEXT,
    "linked_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable: telegram_link_codes
CREATE TABLE "telegram_link_codes" (
    "id"             TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "code"           TEXT NOT NULL,
    "expires_at"     TIMESTAMP(3) NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_participant_id_key" ON "telegram_links"("participant_id");
CREATE UNIQUE INDEX "telegram_link_codes_participant_id_key" ON "telegram_link_codes"("participant_id");
CREATE UNIQUE INDEX "telegram_link_codes_code_key" ON "telegram_link_codes"("code");

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
