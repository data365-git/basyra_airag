-- CreateTable
CREATE TABLE "participant_auth" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_auth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participant_auth_participant_id_key" ON "participant_auth"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "participant_auth_username_key" ON "participant_auth"("username");

-- AddForeignKey
ALTER TABLE "participant_auth" ADD CONSTRAINT "participant_auth_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
