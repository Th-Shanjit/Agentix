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
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return iso;
  }
}

function compactAmount(value: number) {
  const n = Math.max(0, Math.round(value));
  if (n >= 100000) {
    const lakh = n / 100000;
    return `${Number.isInteger(lakh) ? lakh.toFixed(0) : lakh.toFixed(1)}L`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return String(n);
}

function formatRangeLabel(
  range: NonNullable<JobDTO["ctcRange"]>
) {
  const periodLabel = range.period === "MONTHLY" ? "/Monthly" : "/Yearly";
  const currencySymbol: Record<string, string> = {
    USD: "$",
    EUR: "EUR ",
    GBP: "GBP ",
    SGD: "SGD ",
    AED: "AED ",
    INR: "INR ",
  };
  if (range.currency === "INR" && range.format === "LPA" && range.period === "YEARLY") {
    const low = Math.max(0, Math.round(range.low / 100000));
    const high = Math.max(0, Math.round(range.high / 100000));
    return `${low}-${high}LPA`;
  }
  const prefix = currencySymbol[range.currency] ?? `${range.currency} `;
  const low = compactAmount(range.low);
  const high = compactAmount(range.high);
  return `${prefix}${low}-${high}${periodLabel}`;
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
        "rounded-3xl border border-white/15 bg-[#19181A]/70 p-5 shadow-glass backdrop-blur-2xl transition-all duration-300",
        job.applied && "ring-1 ring-emerald-400/25",
        syncPending && "opacity-90"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-snug text-slate-100">
              <Link
                href={`/jobs/${job.id}`}
                className="hover:text-[#CEBC81] hover:underline"
              >
                {job.role}
              </Link>
            </h3>
            {job.notYetListed && (
              <span className="rounded-full border border-amber-300/70 bg-amber-50/80 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-900 backdrop-blur-md">
                Not yet listed
              </span>
            )}
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-300">
            <Building2 className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
            {job.company}
          </p>
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
            Discovered {formatDiscovered(job.dateDiscovered)}
          </p>
          {(job.experienceYearsMin != null || job.experienceYearsMax != null) && (
            <p className="text-xs text-slate-300">
              Experience:{" "}
              {job.experienceYearsMin != null && job.experienceYearsMax != null
                ? `${job.experienceYearsMin}-${job.experienceYearsMax} years`
                : job.experienceYearsMin != null
                  ? `${job.experienceYearsMin}+ years`
                  : `up to ${job.experienceYearsMax} years`}
            </p>
          )}
          {job.ctcRange && (
            <p className="text-sm font-medium text-[#CEBC81]">
              Est. CTC range: {formatRangeLabel(job.ctcRange)}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => onEstimateCtc(job)}
              className={cn(
                "inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 shadow-sm backdrop-blur-xl transition-all duration-300 sm:min-h-0 sm:py-1.5 active:scale-[0.99]",
                "hover:border-[#A16E83]/50 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-[#A16E83]" strokeWidth={1.75} />
              CTC info
            </button>
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => onMatchResume(job)}
              className={cn(
                "inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 shadow-sm backdrop-blur-xl transition-all duration-300 sm:min-h-0 sm:py-1.5 active:scale-[0.99]",
                "hover:border-[#479761]/60 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
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
                "inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-[#CEBC81] shadow-sm backdrop-blur-xl transition-all duration-300 sm:min-h-0 sm:py-1.5 active:scale-[0.99] hover:border-[#CEBC81]/60 hover:bg-white/20",
                syncPending && "pointer-events-none opacity-50"
              )}
            >
              Open posting
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </a>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-xl sm:flex-col sm:items-end sm:py-4">
          <div className="text-right sm:w-full">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Applied
            </p>
            <p className="mt-0.5 text-xs text-slate-300">
              {job.applied
                ? job.appliedAt
                  ? `Applied on ${new Date(job.appliedAt).toLocaleDateString()}`
                  : "Applied"
                : "Not yet"}
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
