"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type RadialScoreProps = {
  percentage: number;
  className?: string;
  size?: number;
};

export function RadialScore({
  percentage,
  className,
  size = 144,
}: RadialScoreProps) {
  const gradId = `agentix-score-${useId().replace(/:/g, "")}`;
  const pct = Math.min(100, Math.max(0, Math.round(percentage)));
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 transform"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(148, 163, 184, 0.35)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#2563eb" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.95" />
          </linearGradient>
        </defs>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-3xl font-semibold tabular-nums text-slate-900">
          {pct}
          <span className="text-lg font-semibold text-slate-500">%</span>
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          ATS match
        </p>
      </div>
    </div>
  );
}
