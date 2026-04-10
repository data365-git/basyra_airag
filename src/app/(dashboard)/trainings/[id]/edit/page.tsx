"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { TrainingForm } from "@/components/trainings/TrainingForm";

export default function EditTrainingPage() {
  const { id } = useParams<{ id: string }>();
  const [training, setTraining] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/trainings/${id}`)
      .then((r) => r.json())
      .then((data) => setTraining(data));
  }, [id]);

  if (!training) return <div className="animate-pulse bg-gray-200 h-64 rounded-xl" />;

  return (
    <div>
      <PageHeader title="Edit Training" back backHref={`/trainings/${id}`} />
      <TrainingForm defaultValues={training} trainingId={id} />
    </div>
  );
}
