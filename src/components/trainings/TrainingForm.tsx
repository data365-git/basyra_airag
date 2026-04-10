"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DAYS_OF_WEEK } from "@/lib/utils";
import toast from "react-hot-toast";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

interface TrainingFormProps {
  defaultValues?: Partial<{
    name: string; description: string; color: string;
    start_date: string; end_date: string; schedule_day: number;
    schedule_time: string; attendance_threshold: number;
  }>;
  trainingId?: string;
}

export function TrainingForm({ defaultValues, trainingId }: TrainingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: defaultValues?.name || "",
    description: defaultValues?.description || "",
    color: defaultValues?.color || "#3B82F6",
    start_date: defaultValues?.start_date || "",
    end_date: defaultValues?.end_date || "",
    schedule_day: defaultValues?.schedule_day ?? 6,
    schedule_time: defaultValues?.schedule_time || "09:00",
    attendance_threshold: defaultValues?.attendance_threshold ?? 80,
  });

  function set(key: string, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const url = trainingId ? `/api/trainings/${trainingId}` : "/api/trainings";
    const method = trainingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      toast.error("Failed to save training");
      setLoading(false);
      return;
    }

    const training = await res.json();
    toast.success(trainingId ? "Training updated" : "Training created");
    router.refresh();
    router.push(`/trainings/${training.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <Input
        label="Training Name"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="e.g. Veb-dasturlash kursi"
        required
      />

      <Textarea
        label="Description"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Optional description..."
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set("color", c)}
              className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c ? "border-gray-900 scale-110" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Start Date"
          type="date"
          value={form.start_date}
          onChange={(e) => set("start_date", e.target.value)}
          required
        />
        <Input
          label="End Date"
          type="date"
          value={form.end_date}
          onChange={(e) => set("end_date", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Day of Week"
          value={form.schedule_day}
          onChange={(e) => set("schedule_day", parseInt(e.target.value))}
          required
        >
          {DAYS_OF_WEEK.map((day: string, i: number) => (
            <option key={i} value={i}>{day}</option>
          ))}
        </Select>
        <Input
          label="Time"
          type="time"
          value={form.schedule_time}
          onChange={(e) => set("schedule_time", e.target.value)}
          required
        />
      </div>

      <Input
        label="Low Attendance Alert Threshold (%)"
        type="number"
        min={0}
        max={100}
        value={form.attendance_threshold}
        onChange={(e) => set("attendance_threshold", parseInt(e.target.value))}
        hint="Alert when participant falls below this attendance rate"
      />

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={loading}>
          {trainingId ? "Save Changes" : "Create Training"}
        </Button>
      </div>
    </form>
  );
}
