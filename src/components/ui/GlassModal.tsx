"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type GlassModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function GlassModal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: GlassModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex max-h-[100dvh] items-end justify-center p-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="glass-modal-title"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 max-h-[min(90dvh,720px)] w-full overflow-hidden rounded-2xl border border-border bg-surface-overlay shadow-card-hover backdrop-blur-2xl transition-all duration-200",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <h2
            id="glass-modal-title"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface p-2 text-foreground-secondary transition-colors duration-150 hover:bg-surface-hover active:scale-[0.95]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="max-h-[min(70dvh,560px)] overflow-y-auto px-5 py-4 text-sm text-foreground-secondary">
          {children}
        </div>
        {footer && (
          <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
