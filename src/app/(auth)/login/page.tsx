"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    toast.success("Welcome back!");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <QrCode size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AttendTrack</h1>
          <p className="text-gray-500 mt-1">Staff login</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
            <Input
              label="Password"
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
              Sign In
            </Button>
          </form>

          <div className="border-t pt-4 mt-4">
            <p className="text-xs text-gray-400 text-center">Demo credentials:</p>
            <div className="mt-2 space-y-1 text-xs text-gray-500 text-center">
              <div>Admin: admin@demo.com / demo1234</div>
              <div>Scanner: scanner@demo.com / demo1234</div>
              <div>Viewer: viewer@demo.com / demo1234</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
