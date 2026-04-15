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
  size = 128,
}: RadialScoreProps) {
  const gradId = `agentix-score-${useId().replace(/:/g, "")}`;
  const pct = Math.min(100, Math.max(0, Math.round(percentage)));
  const stroke = 8;
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
          stroke="var(--border)"
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
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-3xl font-semibold tabular-nums text-foreground">
          {pct}
          <span className="text-lg font-medium text-foreground-muted">%</span>
        </p>
        <p className="kicker">
          ATS match
        </p>
      </div>
    </div>
  );
}
