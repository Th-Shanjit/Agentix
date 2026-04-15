"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type HoverTipProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
};

export function HoverTip({ label, children, className }: HoverTipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-56 -translate-x-1/2 rounded-xl border border-border bg-surface-overlay p-3 text-left text-xs text-foreground-secondary shadow-card-hover backdrop-blur-xl group-hover:block"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
