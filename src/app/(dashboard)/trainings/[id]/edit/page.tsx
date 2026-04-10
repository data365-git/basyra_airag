"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { TrainingForm } from "@/components/trainings/TrainingForm";
import { createClient } from "@/lib/supabase/client";

export default function EditTrainingPage() {
  const { id } = useParams<{ id: string }>();
  const [training, setTraining] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    createClient().from("trainings").select("*").eq("id", id).single()
      .then(({ data }) => setTraining(data));
  }, [id]);

  if (!training) return <div className="animate-pulse bg-gray-200 h-64 rounded-xl" />;

  return (
    <div>
      <PageHeader title="Edit Training" back backHref={`/trainings/${id}`} />
      <TrainingForm defaultValues={training} trainingId={id} />
    </div>
  );
}
