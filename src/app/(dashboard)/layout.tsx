import { DashboardShell } from "@/components/layout/DashboardShell";
import { LanguageProvider } from "@/providers/LanguageProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <DashboardShell>{children}</DashboardShell>
    </LanguageProvider>
  );
}
