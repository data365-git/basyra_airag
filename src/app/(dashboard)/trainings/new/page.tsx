"use client";

import { PageHeader } from "@/components/layout/Header";
import { TrainingForm } from "@/components/trainings/TrainingForm";
import { useTranslation } from "@/providers/LanguageProvider";

export default function NewTrainingPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("trainings.new")} subtitle={t("trainings.create_subtitle")} back />
      <TrainingForm />
    </div>
  );
}
