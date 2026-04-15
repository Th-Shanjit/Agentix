"use client";

import type { GeminiError } from "@/actions/gemini";
import { AlertTriangle, KeyRound, RefreshCw, Timer, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";

function accentForCode(code: GeminiError["code"]) {
  switch (code) {
    case "config":
    case "quota":
    case "rate_limit":
    case "network":
      return "callout-warn";
    default:
      return "callout-error";
  }
}

function IconForCode({ code }: { code: GeminiError["code"] }) {
  const common = "h-4 w-4 shrink-0 opacity-80";
  switch (code) {
    case "config":
    case "quota":
      return <KeyRound className={common} strokeWidth={1.75} />;
    case "rate_limit":
      return <Timer className={common} strokeWidth={1.75} />;
    case "network":
      return <WifiOff className={common} strokeWidth={1.75} />;
    default:
      return <AlertTriangle className={common} strokeWidth={1.75} />;
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
    <div className={cn("text-sm", accent)} role="alert">
      <div className="flex gap-2.5">
        <IconForCode code={error.code} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="kicker opacity-70">
            {error.code.replace(/_/g, " ")}
          </p>
          <p className="leading-relaxed">{error.message}</p>
        </div>
      </div>
      {showRetry && (
        <div className="mt-3 flex justify-end border-t border-current/10 pt-2">
          <button
            type="button"
            disabled={retryBusy}
            onClick={onRetry}
            className="btn-secondary text-xs"
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
