"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";

export default function NewParticipantPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "" });

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      toast.error(t("participants.create_failed"));
      setLoading(false);
      return;
    }

    const participant = await res.json();
    toast.success(t("participants.created"));
    router.push(`/participants/${participant.id}`);
  }

  return (
    <div>
      <PageHeader title={t("participants.add")} back backHref="/participants" />
      <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
        <Input
          label={t("participants.full_name")}
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          placeholder="e.g. Dilnoza Yusupova"
          required
        />
        <Input
          label={t("common.phone")}
          type="tel"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+998 90 123 4567"
        />
        <Input
          label={t("common.email")}
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="optional@example.com"
        />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
          <Button type="submit" loading={loading}>{t("participants.add")}</Button>
        </div>
      </form>
    </div>
  );
}
