"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { isSuperadmin } from "@/lib/permissions";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";

export default function SystemSettingsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [lateThreshold, setLateThreshold] = useState<number>(15);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Redirect non-superadmins
  useEffect(() => {
    if (user && !isSuperadmin(user)) {
      router.replace("/settings/profile");
    }
  }, [user, router]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((settings: { key: string; value: string }[]) => {
        const val = settings.find((s) => s.key === "late_threshold_minutes")?.value;
        if (val !== undefined) {
          const n = parseInt(val, 10);
          if (!isNaN(n)) setLateThreshold(n);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ late_threshold_minutes: lateThreshold }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("settings.system.saved"));
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to save");
    }
  }

  if (!user || !isSuperadmin(user)) return null;

  return (
    <div className="space-y-5">
      <SettingsTabs />

      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          {t("settings.system.title")}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {t("settings.system.subtitle")}
        </p>

        {loading ? (
          <div className="py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5 max-w-sm">
            <div className="space-y-2">
              <Input
                label={t("settings.system.late_threshold_label")}
                type="number"
                min={0}
                max={120}
                value={lateThreshold}
                onChange={(e) => setLateThreshold(parseInt(e.target.value) || 0)}
                hint={t("settings.system.late_threshold_hint")}
              />
              {lateThreshold === 0 && (
                <p className="text-xs text-amber-600">
                  {t("settings.system.late_threshold_disabled")}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
