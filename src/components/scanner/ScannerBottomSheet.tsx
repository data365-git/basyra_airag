"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface ScannerBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function ScannerBottomSheet({ open, onClose, title, children }: ScannerBottomSheetProps) {
  // Close on Escape key (desktop convenience)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 z-30 bg-black/60 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-40 bg-gray-900 rounded-t-2xl",
          "transform transition-transform duration-300 ease-out",
          "max-h-[75%] flex flex-col",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Title */}
        <p className="text-white font-semibold text-base px-4 py-3 shrink-0 border-b border-white/10">
          {title}
        </p>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 py-2">
          {children}
        </div>
      </div>
    </>
  );
}
