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
        className="absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 max-h-[min(90dvh,720px)] w-full overflow-hidden rounded-3xl border border-white/15 bg-[#19181A]/75 shadow-glass backdrop-blur-2xl transition-all duration-300",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/15 px-4 py-4 sm:px-5">
          <h2
            id="glass-modal-title"
            className="text-lg font-semibold tracking-tight text-slate-100"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 bg-white/10 p-2.5 text-slate-200 backdrop-blur-md transition-all duration-300 hover:bg-white/20 active:scale-[0.95]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="max-h-[min(70dvh,560px)] overflow-y-auto px-4 py-4 text-sm text-slate-200 sm:px-5">
          {children}
        </div>
        {footer && (
          <div className="border-t border-white/15 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
