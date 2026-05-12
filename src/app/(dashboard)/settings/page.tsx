"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

// Always redirect to Profile — every user can access their own profile
export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    router.replace("/settings/profile");
  }, [user, router]);

  return null;
}
