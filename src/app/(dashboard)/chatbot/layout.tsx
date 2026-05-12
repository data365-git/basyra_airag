"use client";

export default function ChatbotLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 p-4 sm:p-6">{children}</div>
    </div>
  );
}
