"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DAYS_OF_WEEK, DAYS_SHORT, WEEK_DISPLAY_ORDER, generateSessionDates, cn } from "@/lib/utils";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

interface TrainingFormProps {
  defaultValues?: Partial<{
    name: string;
    description: string;
    color: string;
    start_date: string;
    end_date: string;
    schedule_days: number[];
    schedule_time: string;
    attendance_threshold: number;
    late_threshold_minutes: number | null;
  }>;
  trainingId?: string;
}

export function TrainingForm({ defaultValues, trainingId }: TrainingFormProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  // null = use global default; number = custom override
  const initialLate = defaultValues?.late_threshold_minutes;
  const [lateMode, setLateMode] = useState<"global" | "custom">(
    initialLate !== null && initialLate !== undefined ? "custom" : "global"
  );
  const [customLateMinutes, setCustomLateMinutes] = useState<number>(
    initialLate !== null && initialLate !== undefined ? initialLate : 15
  );

  const [form, setForm] = useState({
    name: defaultValues?.name || "",
    description: defaultValues?.description || "",
    color: defaultValues?.color || "#3B82F6",
    start_date: defaultValues?.start_date || "",
    end_date: defaultValues?.end_date || "",
    schedule_days: defaultValues?.schedule_days ?? [6],
    schedule_time: defaultValues?.schedule_time || "09:00",
    attendance_threshold: defaultValues?.attendance_threshold ?? 80,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDay(day: number) {
    setForm((prev) => {
      const days = prev.schedule_days.includes(day)
        ? prev.schedule_days.filter((d) => d !== day)
        : [...prev.schedule_days, day];
      return { ...prev, schedule_days: days.length ? days : prev.schedule_days };
    });
  }

  const sessionCount = useMemo(() => {
    if (!form.start_date || !form.end_date || form.schedule_days.length === 0) return null;
    try {
      return generateSessionDates(form.start_date, form.end_date, form.schedule_days).length;
    } catch {
      return null;
    }
  }, [form.start_date, form.end_date, form.schedule_days]);

  const scheduleSummary = useMemo(() => {
    const sorted = [...form.schedule_days].sort((a, b) => a - b);
    if (sorted.length === 0) return "";
    if (sorted.length === 1) return `every ${DAYS_OF_WEEK[sorted[0]]}`;
    if (sorted.length === 2) return `every ${DAYS_OF_WEEK[sorted[0]]} & ${DAYS_OF_WEEK[sorted[1]]}`;
    return `every ${sorted.map((d) => DAYS_SHORT[d]).join(", ")}`;
  }, [form.schedule_days]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.schedule_days.length === 0) {
      toast.error(t("trainings.day_required"));
      return;
    }

    setLoading(true);
    const url = trainingId ? `/api/trainings/${trainingId}` : "/api/trainings";
    const method = trainingId ? "PATCH" : "POST";

    const body = {
      ...form,
      schedule_days: [...new Set(form.schedule_days)].sort((a, b) => a - b),
      late_threshold_minutes: lateMode === "custom" ? customLateMinutes : null,
    };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("trainings.save_failed"));
      setLoading(false);
      return;
    }

    const training = await res.json();
    toast.success(trainingId ? t("trainings.updated") : t("trainings.created"));
    router.refresh();
    router.push(`/trainings/${training.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <Input
        label={t("trainings.name_label")}
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="e.g. Veb-dasturlash kursi"
        required
      />

      <Textarea
        label={t("common.description")}
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Optional description..."
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("common.color")}</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set("color", c)}
              className={`w-8 h-8 rounded-full border-2 transition-transform ${
                form.color === c ? "border-gray-900 scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label={t("trainings.start_date")}
          type="date"
          value={form.start_date}
          onChange={(e) => set("start_date", e.target.value)}
          required
        />
        <Input
          label={t("trainings.end_date")}
          type="date"
          value={form.end_date}
          onChange={(e) => set("end_date", e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("trainings.schedule_day")} <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {WEEK_DISPLAY_ORDER.map((dayIndex) => {
            const selected = form.schedule_days.includes(dayIndex);
            return (
              <button
                key={dayIndex}
                type="button"
                onClick={() => toggleDay(dayIndex)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  selected
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"
                )}
              >
                {DAYS_SHORT[dayIndex]}
              </button>
            );
          })}
        </div>

        {sessionCount !== null && (
          <p className="mt-2 text-sm text-gray-500 flex items-center gap-1.5">
            <span>📅</span>
            <span>
              Sessions {scheduleSummary} — approx.{" "}
              <span className={cn("font-semibold", sessionCount === 0 ? "text-red-500" : "text-blue-600")}>
                {sessionCount} session{sessionCount !== 1 ? "s" : ""}
              </span>
              {form.start_date && form.end_date
                ? ` between ${new Date(form.start_date).toLocaleDateString()} and ${new Date(form.end_date).toLocaleDateString()}`
                : ""}
            </span>
          </p>
        )}
        {sessionCount === 0 && form.start_date && form.end_date && (
          <p className="mt-1 text-xs text-red-500">
            {t("trainings.no_sessions_warning")}
          </p>
        )}
      </div>

      <Input
        label={t("trainings.schedule_time")}
        type="time"
        value={form.schedule_time}
        onChange={(e) => set("schedule_time", e.target.value)}
        required
      />

      <Input
        label={t("trainings.threshold")}
        type="number"
        min={0}
        max={100}
        value={form.attendance_threshold}
        onChange={(e) => set("attendance_threshold", parseInt(e.target.value))}
        hint={t("trainings.threshold_hint")}
      />

      {/* Late arrival threshold */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {t("trainings.late_threshold_label")}
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setLateMode("global")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
              lateMode === "global"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-600 hover:border-blue-400"
            )}
          >
            {t("trainings.late_threshold_global")}
          </button>
          <button
            type="button"
            onClick={() => setLateMode("custom")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
              lateMode === "custom"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-600 hover:border-blue-400"
            )}
          >
            {t("trainings.late_threshold_custom")}
          </button>
        </div>
        {lateMode === "custom" && (
          <Input
            type="number"
            min={0}
            max={120}
            value={customLateMinutes}
            onChange={(e) => setCustomLateMinutes(parseInt(e.target.value) || 0)}
            hint={t("trainings.late_threshold_hint")}
          />
        )}
        {lateMode === "global" && (
          <p className="text-xs text-gray-400">{t("trainings.late_threshold_global_hint")}</p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" loading={loading} disabled={form.schedule_days.length === 0 || sessionCount === 0}>
          {trainingId ? t("common.save") : t("trainings.new")}
        </Button>
      </div>
    </form>
  );
}
