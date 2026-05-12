"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { TrainingForm } from "@/components/trainings/TrainingForm";
import { useTranslation } from "@/providers/LanguageProvider";

function EditFormSkeleton() {
  return (
    <div className="space-y-5 max-w-xl animate-pulse">
      {/* Name */}
      <div className="space-y-1">
        <div className="h-4 w-28 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-100 rounded-lg" />
      </div>
      {/* Description */}
      <div className="space-y-1">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-20 bg-gray-100 rounded-lg" />
      </div>
      {/* Color */}
      <div className="space-y-1">
        <div className="h-4 w-12 bg-gray-200 rounded" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="w-8 h-8 rounded-full bg-gray-200" />
          ))}
        </div>
      </div>
      {/* Date row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded-lg" />
        </div>
        <div className="space-y-1">
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded-lg" />
        </div>
      </div>
      {/* Schedule row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded-lg" />
        </div>
        <div className="space-y-1">
          <div className="h-4 w-12 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded-lg" />
        </div>
      </div>
      {/* Threshold */}
      <div className="space-y-1">
        <div className="h-4 w-48 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-100 rounded-lg" />
      </div>
      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        <div className="h-10 w-24 bg-gray-200 rounded-lg" />
        <div className="h-10 w-32 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}

export default function EditTrainingPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [training, setTraining] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/trainings/${id}`)
      .then((r) => r.json())
      .then((data) => setTraining(data));
  }, [id]);

  return (
    <div>
      <PageHeader title={t("trainings.edit")} back backHref={`/trainings/${id}`} />
      {training ? (
        <TrainingForm defaultValues={training} trainingId={id} />
      ) : (
        <EditFormSkeleton />
      )}
    </div>
  );
}
