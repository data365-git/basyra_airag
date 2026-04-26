"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function ChatbotFeedbackPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/ai-reviews"); }, [router]);
  return null;
}
