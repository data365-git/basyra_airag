-- CreateTable training_categories
CREATE TABLE "training_categories" (
    "id" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "name_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable translations
CREATE TABLE "translations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- AlterTable trainings — add categoryId FK (nullable)
ALTER TABLE "trainings" ADD COLUMN "category_id" TEXT;

-- CreateIndex translations unique [key, language]
CREATE UNIQUE INDEX "translations_key_language_key" ON "translations"("key", "language");

-- AddForeignKey trainings -> training_categories
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "training_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey translations -> staff_users
ALTER TABLE "translations" ADD CONSTRAINT "translations_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
