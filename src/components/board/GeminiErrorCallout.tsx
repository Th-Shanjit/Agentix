"use client";

import type { GeminiError } from "@/actions/gemini";
import { AlertTriangle, KeyRound, RefreshCw, Timer, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";

function accentForCode(code: GeminiError["code"]) {
  switch (code) {
    case "config":
    case "quota":
      return "border-amber-200/90 bg-amber-50/90 text-amber-950";
    case "rate_limit":
    case "network":
      return "border-orange-200/90 bg-orange-50/90 text-orange-950";
    default:
      return "border-red-200/80 bg-red-50/90 text-red-900";
  }
}

function IconForCode({ code }: { code: GeminiError["code"] }) {
  const common = "h-4 w-4 shrink-0";
  switch (code) {
    case "config":
    case "quota":
      return <KeyRound className={cn(common, "text-amber-800")} strokeWidth={1.75} />;
    case "rate_limit":
      return <Timer className={cn(common, "text-orange-800")} strokeWidth={1.75} />;
    case "network":
      return <WifiOff className={cn(common, "text-orange-800")} strokeWidth={1.75} />;
    default:
      return <AlertTriangle className={cn(common, "text-red-800")} strokeWidth={1.75} />;
  }
}

type GeminiErrorCalloutProps = {
  error: GeminiError;
  onRetry?: () => void;
  retryBusy?: boolean;
};

export function GeminiErrorCallout({
  error,
  onRetry,
  retryBusy,
}: GeminiErrorCalloutProps) {
  const accent = accentForCode(error.code);
  const showRetry = Boolean(error.retryable && onRetry);

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 text-sm",
        accent
      )}
      role="alert"
    >
      <div className="flex gap-2.5">
        <IconForCode code={error.code} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
            {error.code.replace(/_/g, " ")}
          </p>
          <p className="leading-relaxed">{error.message}</p>
        </div>
      </div>
      {showRetry && (
        <div className="mt-3 flex justify-end border-t border-black/5 pt-2">
          <button
            type="button"
            disabled={retryBusy}
            onClick={onRetry}
            className={cn(
              "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/60 bg-white/50 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm backdrop-blur-md transition-all",
              "hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
            )}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", retryBusy && "animate-spin")}
              strokeWidth={1.75}
            />
            {retryBusy ? "Retrying…" : "Try again"}
          </button>
        </div>
      )}
    </div>
  );
}
