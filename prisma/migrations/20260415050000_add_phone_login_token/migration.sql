-- CreateTable
CREATE TABLE "phone_login_tokens" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "phone_login_tokens_token_key" ON "phone_login_tokens"("token");

-- AddForeignKey
ALTER TABLE "phone_login_tokens" ADD CONSTRAINT "phone_login_tokens_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
