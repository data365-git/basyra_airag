"use client";

import { ChevronLeft, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  backHref?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function Header({ title, subtitle, back, backHref, actions, className }: HeaderProps) {
  const router = useRouter();

  function handleBack() {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  }

  return (
    <div className={cn("flex items-center gap-3 mb-6", className)}>
      {back && (
        <button
          onClick={handleBack}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-gray-900 truncate">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  backHref,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  back?: boolean;
  backHref?: string;
}) {
  return (
    <div className="mb-6">
      <Header
        title={title}
        subtitle={subtitle}
        actions={actions}
        back={back}
        backHref={backHref}
      />
    </div>
  );
}
