"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";

export default function EditParticipantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "" });

  useEffect(() => {
    if (!id) return;
    fetch(`/api/participants/${id}`)
      .then((r) => r.json())
      .then((p) => {
        setForm({
          full_name: p.full_name || "",
          phone: p.phone || "",
          email: p.email || "",
        });
        setLoading(false);
      });
  }, [id]);

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch(`/api/participants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: form.full_name,
        phone: form.phone || null,
        email: form.email || null,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("trainings.save_failed"));
      return;
    }

    toast.success(t("participants.updated"));
    router.refresh();
    router.push(`/participants/${id}`);
  }

  if (loading) return <CardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("participants.edit_title")}
        back
        backHref={`/participants/${id}`}
      />

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <Input
          label={t("participants.full_name")}
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          placeholder="Enter full name"
          required
        />
        <Input
          label={t("common.phone")}
          type="tel"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+998 90 123 45 67"
        />
        <Input
          label={t("common.email")}
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="participant@example.com"
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
