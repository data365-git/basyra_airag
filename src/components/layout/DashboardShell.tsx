import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-24 lg:pb-8">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
