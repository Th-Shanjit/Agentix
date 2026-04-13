"use client";

import Link from "next/link";
import {
  ExternalLink,
  Building2,
  CalendarDays,
  Sparkles,
  Target,
} from "lucide-react";
import { IOSToggle } from "@/components/ui/IOSToggle";
import type { JobDTO } from "@/lib/jobs";
import { cn } from "@/lib/cn";

type JobCardProps = {
  job: JobDTO;
  busy: boolean;
  aiBusy: boolean;
  /** True while the row is optimistic (not yet persisted). */
  pendingSync?: boolean;
  onAppliedChange: (id: string, applied: boolean) => void;
  onEstimateCtc: (job: JobDTO) => void;
  onMatchResume: (job: JobDTO) => void;
};

function formatDiscovered(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

export function JobCard({
  job,
  busy,
  aiBusy,
  pendingSync,
  onAppliedChange,
  onEstimateCtc,
  onMatchResume,
}: JobCardProps) {
  const syncPending = Boolean(pendingSync);
  const actionsDisabled = aiBusy || syncPending;

  return (
    <article
      className={cn(
        "rounded-3xl border border-white/60 bg-white/40 p-5 shadow-glass backdrop-blur-2xl transition-all duration-300",
        job.applied && "ring-1 ring-emerald-400/25",
        syncPending && "opacity-90"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-snug text-slate-900">
              <Link
                href={`/jobs/${job.id}`}
                className="hover:text-violet-800 hover:underline"
              >
                {job.role}
              </Link>
            </h3>
            <span className="rounded-full border border-white/60 bg-white/35 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600 backdrop-blur-md">
              {job.source}
            </span>
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Building2 className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
            {job.company}
          </p>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
            Discovered {formatDiscovered(job.dateDiscovered)}
          </p>
          {job.ctc && (
            <p className="text-sm font-medium text-violet-800/90">CTC: {job.ctc}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => onEstimateCtc(job)}
              className={cn(
                "inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 sm:min-h-0 sm:py-1.5 active:scale-[0.99]",
                "hover:border-violet-300/60 hover:bg-white/65 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-violet-700" strokeWidth={1.75} />
              Estimate CTC
            </button>
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => onMatchResume(job)}
              className={cn(
                "inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 sm:min-h-0 sm:py-1.5 active:scale-[0.99]",
                "hover:border-emerald-300/60 hover:bg-white/65 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <Target className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
              Match resume
            </button>
            <a
              href={job.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={syncPending}
              className={cn(
                "inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-3 py-2 text-xs font-semibold text-violet-700 shadow-sm backdrop-blur-xl transition-all duration-300 sm:min-h-0 sm:py-1.5 active:scale-[0.99] hover:border-violet-300/60 hover:bg-white/65",
                syncPending && "pointer-events-none opacity-50"
              )}
            >
              Open posting
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </a>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-white/50 bg-white/30 px-4 py-3 backdrop-blur-xl sm:flex-col sm:items-end sm:py-4">
          <div className="text-right sm:w-full">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Applied
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              {job.applied ? "On your radar" : "Not yet"}
            </p>
          </div>
          <IOSToggle
            checked={job.applied}
            disabled={busy || syncPending}
            aria-label={`Mark ${job.role} at ${job.company} as applied`}
            onChange={(next) => onAppliedChange(job.id, next)}
          />
        </div>
      </div>
    </article>
  );
}
