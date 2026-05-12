// Portal has no sidebar or admin chrome — just renders children directly.
// Root layout already wraps everything with LanguageProvider + Toaster.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
