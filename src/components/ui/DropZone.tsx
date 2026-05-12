"use client";

import { useRef, useState, DragEvent } from "react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFiles:    (files: File[]) => void;
  maxSizeMb?: number;
  className?: string;
  children?:  React.ReactNode;
  disabled?:  boolean;
  /** Restrict file input to specific MIME types / extensions, e.g. "image/*,application/pdf" */
  accept?:    string;
}

/**
 * Reusable drag-and-drop / click-to-browse zone.
 * Uses native HTML5 drag events — no external dependency.
 *
 * Usage:
 *   <DropZone onFiles={(files) => handleFiles(files)} className="p-8">
 *     <p>Drop files here</p>
 *   </DropZone>
 */
export function DropZone({
  onFiles,
  maxSizeMb = 50,
  className,
  children,
  disabled,
  accept,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  function onDrag(e: DragEvent, entering: boolean) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragging(entering);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (disabled) return;

    const all   = Array.from(e.dataTransfer.files);
    const limit = maxSizeMb * 1024 * 1024;
    const over  = all.filter((f) => f.size > limit);
    const valid = all.filter((f) => f.size <= limit);

    if (over.length) {
      setSizeError(`${over.map((f) => f.name).join(", ")} — ${maxSizeMb} MB dan katta`);
      setTimeout(() => setSizeError(null), 4000);
    }
    if (valid.length) onFiles(valid);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    // reset so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Fayl yuklash zonasi"
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
      onDragEnter={(e) => onDrag(e, true)}
      onDragOver={(e)  => onDrag(e, true)}
      onDragLeave={(e) => onDrag(e, false)}
      onDrop={onDrop}
      className={cn(
        "relative cursor-pointer select-none rounded-xl border-2 border-dashed transition-all duration-200 outline-none",
        dragging
          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200 ring-offset-0 scale-[1.01]"
          : "border-gray-200 hover:border-blue-300 hover:bg-gray-50",
        "focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-200",
        disabled && "pointer-events-none opacity-40 cursor-default",
        className
      )}
    >
      {children}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={onInput}
      />

      {/* Size-error toast inside the zone */}
      {sizeError && (
        <div className="absolute inset-x-2 bottom-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 text-center z-10 pointer-events-none">
          {sizeError}
        </div>
      )}
    </div>
  );
}
