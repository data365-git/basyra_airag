"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";

const SHOW_DEMO = process.env.NODE_ENV !== "production";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernameOrEmail, password }),
    });

    if (!res.ok) {
      setError(t("auth.invalid_credentials"));
      setLoading(false);
      return;
    }

    toast.success(t("auth.welcome_back"));
    const redirect = searchParams.get("redirect") || "/";
    router.push(redirect);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username or email"
          type="text"
          value={usernameOrEmail}
          onChange={(e) => setUsernameOrEmail(e.target.value)}
          placeholder="username or you@example.com"
          required
          autoComplete="username"
        />
        <Input
          label={t("auth.password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} className="w-full" size="lg">
          {t("auth.sign_in")}
        </Button>
      </form>

      {SHOW_DEMO && (
        <div className="border-t pt-4 mt-4">
          <p className="text-xs text-gray-400 text-center">{t("auth.demo_credentials")}</p>
          <div className="mt-2 space-y-1 text-xs text-gray-500 text-center">
            <div>Admin: admin@demo.com / demo1234</div>
            <div>Scanner: scanner@demo.com / demo1234</div>
            <div>Viewer: viewer@demo.com / demo1234</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <QrCode size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AttendTrack</h1>
          <p className="text-gray-500 mt-1">{t("auth.staff_login")}</p>
        </div>

        <Suspense fallback={
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="space-y-4 animate-pulse">
              <div className="h-16 bg-gray-100 rounded-lg" />
              <div className="h-16 bg-gray-100 rounded-lg" />
              <div className="h-12 bg-gray-200 rounded-lg" />
            </div>
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
