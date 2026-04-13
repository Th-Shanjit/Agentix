"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type HoverTipProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Simple hover card for badge tooltips (desktop); tap title on mobile reads label via title attr on child wrapper. */
export function HoverTip({ label, children, className }: HoverTipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-2xl border border-white/60 bg-white/95 p-3 text-left text-xs text-slate-700 shadow-lg backdrop-blur-xl group-hover:block"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
