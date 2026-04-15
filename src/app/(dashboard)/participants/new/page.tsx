"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/providers/LanguageProvider";
import { Copy, Check, User, Lock, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

interface Credentials { username: string; password: string }

function CredentialsCard({
  name, credentials, participantId, onContinue,
}: {
  name: string;
  credentials: Credentials;
  participantId: string;
  onContinue: () => void;
}) {
  const [copiedU, setCopiedU] = useState(false);
  const [copiedP, setCopiedP] = useState(false);

  async function copyField(value: string, which: "u" | "p") {
    try { await navigator.clipboard.writeText(value); } catch { return; }
    if (which === "u") { setCopiedU(true); setTimeout(() => setCopiedU(false), 2000); }
    else               { setCopiedP(true); setTimeout(() => setCopiedP(false), 2000); }
  }

  async function copyBoth() {
    const text = `Login: ${credentials.username}\nParol: ${credentials.password}`;
    try { await navigator.clipboard.writeText(text); } catch { return; }
    toast.success("Nusxa olindi");
  }

  return (
    <div className="max-w-md space-y-5">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
        ✅ <strong>{name}</strong> muvaffaqiyatli qo&apos;shildi.
        Portal kirish ma&apos;lumotlari <strong>avtomatik yaratildi</strong>.
        Parol faqat hozir ko&apos;rsatiladi — uni ishtirokchiga yetkazing!
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-semibold text-gray-700">Portal kirish ma&apos;lumotlari</p>
        </div>
        <div className="divide-y divide-gray-50">
          {/* Username */}
          <div className="flex items-center gap-3 px-4 py-3">
            <User size={16} className="text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">Login</p>
              <p className="font-mono text-sm font-semibold text-gray-900">{credentials.username}</p>
            </div>
            <button
              onClick={() => copyField(credentials.username, "u")}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
              title="Nusxa olish"
            >
              {copiedU ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>

          {/* Password */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Lock size={16} className="text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">Parol</p>
              <p className="font-mono text-sm font-semibold text-gray-900 tracking-wider">{credentials.password}</p>
            </div>
            <button
              onClick={() => copyField(credentials.password, "p")}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
              title="Nusxa olish"
            >
              {copiedP ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Copy both */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={copyBoth}
            className="w-full flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium py-1"
          >
            <Copy size={14} /> Ikkalasini nusxa olish
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => onContinue()}>
          Ishtirokchilar ro&apos;yxati
        </Button>
        <Button onClick={() => window.location.href = `/participants/${participantId}`}>
          Profilga o&apos;tish <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export default function NewParticipantPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "" });

  // After creation
  const [created, setCreated] = useState<{ id: string; name: string; credentials: Credentials } | null>(null);

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
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? t("participants.create_failed"));
      setLoading(false);
      return;
    }

    const data = await res.json();
    setCreated({ id: data.id, name: data.full_name, credentials: data.credentials });
    setLoading(false);
  }

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ishtirokchi qo'shildi" back backHref="/participants" />
        <CredentialsCard
          name={created.name}
          credentials={created.credentials}
          participantId={created.id}
          onContinue={() => { router.refresh(); router.push("/participants"); }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("participants.add")} back backHref="/participants" />
      <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
        <Input
          label={t("participants.full_name")}
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          placeholder="Masalan: Dilnoza Yusupova"
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
        <p className="text-xs text-gray-400">
          Portal kirish ma&apos;lumotlari (login va parol) avtomatik yaratiladi va keyingi sahifada ko&apos;rsatiladi.
        </p>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
          <Button type="submit" loading={loading}>{t("participants.add")}</Button>
        </div>
      </form>
    </div>
  );
}
