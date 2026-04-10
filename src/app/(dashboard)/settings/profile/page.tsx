"use client";

import { useState, useEffect } from "react";
import { Camera } from "lucide-react";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/providers/LanguageProvider";
import toast from "react-hot-toast";

function Avatar({
  name,
  avatarUrl,
  size = 20,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size * 4, height: size * 4 }}
        onError={(e) => {
          // Fall back to initials on broken URL
          (e.currentTarget as HTMLImageElement).style.display = "none";
          (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute(
            "style"
          );
        }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-blue-600 flex items-center justify-center text-white font-bold"
      style={{ width: size * 4, height: size * 4, fontSize: size * 1.2 }}
    >
      {initials || "?"}
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Populate form once user loads
  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setAvatarUrl(user.avatar_url ?? "");
    }
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), avatar_url: avatarUrl.trim() }),
    });
    setSavingProfile(false);
    if (res.ok) {
      toast.success(t("settings.profile.saved"));
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to save");
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t("settings.profile.passwords_mismatch"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("settings.profile.password_too_short"));
      return;
    }
    setSavingPassword(true);
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    setSavingPassword(false);
    if (res.ok) {
      toast.success(t("settings.profile.saved"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.error === "wrong_password") {
        toast.error(t("settings.profile.wrong_password"));
      } else {
        toast.error(err.error ?? "Failed to save");
      }
    }
  }

  return (
    <div className="space-y-5">
      <SettingsTabs />

      {/* Profile info card */}
      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-5">
          {t("settings.profile.title")}
        </h2>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          {/* Avatar preview + URL input */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <Avatar name={name || user?.name || "?"} avatarUrl={avatarUrl || null} size={14} />
              <div className="absolute bottom-0 right-0 w-7 h-7 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white">
                <Camera size={13} className="text-white" />
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                {t("settings.profile.avatar_label")}
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400">{t("settings.profile.avatar_hint")}</p>
            </div>
          </div>

          {/* Display name */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {t("settings.profile.name_label")} <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {t("settings.profile.email_label")}
            </label>
            <input
              readOnly
              value={user?.email ?? ""}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={savingProfile}>
              {t("settings.profile.save_profile")}
            </Button>
          </div>
        </form>
      </Card>

      {/* Change password card */}
      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-5">
          {t("settings.profile.change_password")}
        </h2>

        <form onSubmit={handleSavePassword} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {t("settings.profile.current_password")} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {t("settings.profile.new_password")} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {t("settings.profile.confirm_password")} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                confirmPassword && confirmPassword !== newPassword
                  ? "border-red-400 focus:ring-red-500"
                  : "border-gray-300"
              }`}
            />
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-red-500">{t("settings.profile.passwords_mismatch")}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={savingPassword}>
              {t("settings.profile.save_profile")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
