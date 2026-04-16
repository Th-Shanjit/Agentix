"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      (document.activeElement instanceof HTMLElement ? document.activeElement : null) ??
      null;

    const getFocusable = () => {
      const root = panelRef.current;
      if (!root) return [];
      const list = Array.from(
        root.querySelectorAll<HTMLElement>(
          [
            "a[href]",
            "button:not([disabled])",
            "textarea:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
          ].join(",")
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      return list;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!active) return;

      if (e.shiftKey) {
        if (active === first || !panelRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panelRef.current?.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const fallback = getFocusable()[0] ?? null;
      (closeBtnRef.current ?? fallback)?.focus?.();
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      previouslyFocusedRef.current?.focus?.();
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
        ref={panelRef}
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
            ref={closeBtnRef}
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
