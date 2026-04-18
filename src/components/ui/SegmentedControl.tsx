"use client";

import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options:   Option<T>[];
  value:     T;
  onChange:  (value: T) => void;
  className?: string;
  disabled?:  boolean;
}

/**
 * Pill-style segmented control.  One option always appears "active" with a
 * raised white pill; others are transparent.
 *
 * Usage:
 *   <SegmentedControl
 *     options={[
 *       { value: "file", label: <>📎 Fayl</> },
 *       { value: "link", label: <>🔗 Havola</> },
 *     ]}
 *     value={mode}
 *     onChange={setMode}
 *   />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  disabled,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex w-full rounded-xl bg-gray-100 p-1 gap-1",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 outline-none",
              active
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-white/50",
              "focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
