"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { useTranslation } from "@/providers/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { isSuperadmin } from "@/lib/permissions";
import toast from "react-hot-toast";

interface GradingPolicy {
  on_time_pct: number;
  same_day_pct: number;
  per_day_late_penalty_pct: number;
  late_floor_pct: number;
  early_bonus_pct: number;
  early_bonus_days: number;
}

const DEFAULT_POLICY: GradingPolicy = {
  on_time_pct: 100,
  same_day_pct: 90,
  per_day_late_penalty_pct: 20,
  late_floor_pct: 10,
  early_bonus_pct: 0,
  early_bonus_days: 2,
};

function computePreview(policy: GradingPolicy): { day: number; pct: number }[] {
  const points = [];
  for (let d = -3; d <= 7; d++) {
    let pct: number;
    if (d < 0) {
      pct = policy.early_bonus_pct > 0 && -d >= policy.early_bonus_days
        ? Math.min(100, policy.on_time_pct + policy.early_bonus_pct)
        : policy.on_time_pct;
    } else if (d === 0) {
      pct = policy.same_day_pct;
    } else {
      pct = Math.max(policy.late_floor_pct, policy.on_time_pct - d * policy.per_day_late_penalty_pct);
    }
    points.push({ day: d, pct });
  }
  return points;
}

export default function GradingSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const superadmin = isSuperadmin(user);

  const [policy, setPolicy] = useState<GradingPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/grading")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.on_time_pct === "number") setPolicy(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/grading", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("settings.grading.saved"));
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("settings.grading.save_failed"));
    }
  }

  const preview = computePreview(policy);
  const maxPct = 100;

  function SliderField({
    label,
    hint,
    field,
    min,
    max,
  }: {
    label: string;
    hint?: string;
    field: keyof GradingPolicy;
    min: number;
    max: number;
  }) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-900">{label}</label>
          <span className="text-sm font-semibold text-blue-600 w-12 text-right">
            {policy[field]}{field === "early_bonus_days" ? "d" : "%"}
          </span>
        </div>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
        <input
          type="range"
          min={min}
          max={max}
          value={policy[field]}
          disabled={!superadmin}
          onChange={(e) =>
            setPolicy((p) => ({ ...p, [field]: Number(e.target.value) }))
          }
          className="w-full accent-blue-600 disabled:opacity-50"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>{min}{field === "early_bonus_days" ? "d" : "%"}</span>
          <span>{max}{field === "early_bonus_days" ? "d" : "%"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.settings")}
        subtitle={t("settings.grading.subtitle")}
        actions={
          superadmin && (
            <Button size="sm" onClick={save} loading={saving}>
              {t("common.save")}
            </Button>
          )
        }
      />

      <SettingsTabs />

      {loading ? (
        <div className="h-48 bg-gray-100 animate-pulse rounded-xl" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sliders */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              {t("settings.grading.parameters")}
            </h2>

            <SliderField
              label={t("settings.grading.on_time_pct")}
              hint={t("settings.grading.on_time_pct_hint")}
              field="on_time_pct"
              min={50}
              max={100}
            />
            <SliderField
              label={t("settings.grading.same_day_pct")}
              hint={t("settings.grading.same_day_pct_hint")}
              field="same_day_pct"
              min={50}
              max={100}
            />
            <SliderField
              label={t("settings.grading.per_day_late_penalty_pct")}
              hint={t("settings.grading.per_day_late_penalty_hint")}
              field="per_day_late_penalty_pct"
              min={0}
              max={50}
            />
            <SliderField
              label={t("settings.grading.late_floor_pct")}
              hint={t("settings.grading.late_floor_pct_hint")}
              field="late_floor_pct"
              min={0}
              max={50}
            />
            <SliderField
              label={t("settings.grading.early_bonus_pct")}
              hint={t("settings.grading.early_bonus_hint")}
              field="early_bonus_pct"
              min={0}
              max={20}
            />
            <SliderField
              label={t("settings.grading.early_bonus_days")}
              hint={t("settings.grading.early_bonus_days_hint")}
              field="early_bonus_days"
              min={1}
              max={14}
            />
          </div>

          {/* Live curve preview */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              {t("settings.grading.preview_title")}
            </h2>
            <p className="text-xs text-gray-500">{t("settings.grading.preview_hint")}</p>

            <div className="relative h-48 border border-gray-100 rounded-lg bg-gray-50 overflow-hidden">
              {/* Y-axis grid lines */}
              {[0, 25, 50, 75, 100].map((v) => (
                <div
                  key={v}
                  className="absolute w-full border-t border-gray-200"
                  style={{ bottom: `${v}%` }}
                >
                  <span className="absolute left-1 -top-3 text-[9px] text-gray-400">{v}%</span>
                </div>
              ))}

              {/* Bars */}
              <div className="absolute inset-0 flex items-end justify-around px-2 pb-0">
                {preview.map(({ day, pct }) => {
                  const isLate = day > 0;
                  const isEarly = day < 0;
                  const barColor = isLate
                    ? pct <= policy.late_floor_pct + 5 ? "bg-red-400" : "bg-orange-400"
                    : isEarly ? "bg-green-400"
                    : "bg-blue-400";
                  return (
                    <div key={day} className="flex flex-col items-center gap-0.5 flex-1">
                      <span className="text-[9px] text-gray-500 font-medium">{pct}%</span>
                      <div
                        className={`w-full rounded-t-sm ${barColor} transition-all duration-150`}
                        style={{ height: `${(pct / maxPct) * 100}%` }}
                      />
                      <span className="text-[9px] text-gray-400">
                        {day === 0 ? "0" : day > 0 ? `+${day}` : `${day}`}d
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-400 inline-block"/> {t("settings.grading.legend_early")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block"/> {t("settings.grading.legend_ontime")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-400 inline-block"/> {t("settings.grading.legend_late")}</span>
            </div>

            {!superadmin && (
              <p className="text-xs text-gray-400 italic">{t("settings.grading.readonly_notice")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
