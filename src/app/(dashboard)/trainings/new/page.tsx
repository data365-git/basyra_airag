import { PageHeader } from "@/components/layout/Header";
import { TrainingForm } from "@/components/trainings/TrainingForm";

export default function NewTrainingPage() {
  return (
    <div>
      <PageHeader title="Create Training" subtitle="Set up a new training program" back />
      <TrainingForm />
    </div>
  );
}
