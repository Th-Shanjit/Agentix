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
import { relevanceScoreToLetterGrade } from "@/lib/grades";

type JobCardProps = {
  job: JobDTO;
  busy: boolean;
  aiBusy: boolean;
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

function formatRangeLabel(range: NonNullable<JobDTO["ctcRange"]>) {
  const periodLabel = range.period === "MONTHLY" ? "/Monthly" : "/Yearly";
  const currencySymbol: Record<string, string> = {
    USD: "$",
    EUR: "EUR ",
    GBP: "GBP ",
    SGD: "SGD ",
    AED: "AED ",
    INR: "INR ",
  };
  if (
    range.currency === "INR" &&
    range.format === "LPA" &&
    range.period === "YEARLY"
  ) {
    const low = Math.max(0, Math.round(range.low / 100000));
    const high = Math.max(0, Math.round(range.high / 100000));
    return `${low}-${high}LPA`;
  }
  const prefix = currencySymbol[range.currency] ?? `${range.currency} `;
  const low = compactAmount(range.low);
  const high = compactAmount(range.high);
  return `${prefix}${low}-${high}${periodLabel}`;
}

function ctcConfidenceLabel(confidence: NonNullable<JobDTO["ctcRange"]>["confidence"]) {
  if (confidence === "HIGH") return "High Accuracy";
  if (confidence === "MID") return "Medium Accuracy";
  return "Low Accuracy";
}

function ctcConfidenceBadgeClass(
  confidence: NonNullable<JobDTO["ctcRange"]>["confidence"]
) {
  if (confidence === "HIGH") {
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";
  }
  if (confidence === "MID") {
    return "border-amber-500/30 bg-amber-500/15 text-amber-200";
  }
  return "border-red-500/30 bg-red-500/15 text-red-200";
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
  const aiActionsDisabled = aiBusy || syncPending;
  const hasRelevance =
    typeof job.relevanceScore === "number" &&
    Number.isFinite(job.relevanceScore);
  const scorePct = hasRelevance ? Math.round(job.relevanceScore ?? 0) : null;
  const grade = hasRelevance
    ? relevanceScoreToLetterGrade(scorePct ?? 0)
    : null;

  return (
    <article
      className={cn(
        "card p-4 transition-shadow duration-150 sm:p-5",
        job.applied && "ring-1 ring-success/25",
        syncPending && "opacity-90"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-snug text-foreground">
              <Link
                href={`/jobs/${job.id}`}
                className="hover:text-primary hover:underline"
              >
                {job.role}
              </Link>
            </h3>
            {job.notYetListed && (
              <span className="badge-amber px-2 py-0.5 text-[11px] font-medium">
                Not yet listed
              </span>
            )}
          </div>
          <p className="flex items-center gap-2 text-sm text-foreground-secondary">
            <Building2
              className="h-4 w-4 shrink-0 opacity-60"
              strokeWidth={1.75}
            />
            {job.company}
          </p>
          <p className="flex items-center gap-2 text-xs text-foreground-muted">
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 opacity-60"
              strokeWidth={1.75}
            />
            Discovered {formatDiscovered(job.dateDiscovered)}
          </p>
          <p className="text-xs text-foreground-secondary">
            Experience:{" "}
            {job.experienceYearsMin != null && job.experienceYearsMax != null
              ? `${job.experienceYearsMin}-${job.experienceYearsMax} years`
              : job.experienceYearsMin != null
                ? `${job.experienceYearsMin}+ years`
                : job.experienceYearsMax != null
                  ? `up to ${job.experienceYearsMax} years`
                  : "Nil"}
          </p>
          {job.ctcRange && (
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span style={{ color: "var(--callout-warn-text)" }}>
                Est. CTC range: {formatRangeLabel(job.ctcRange)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                  ctcConfidenceBadgeClass(job.ctcRange.confidence)
                )}
              >
                {ctcConfidenceLabel(job.ctcRange.confidence)}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={aiActionsDisabled}
              onClick={() => onEstimateCtc(job)}
              className="btn-secondary text-xs"
            >
              <Sparkles
                className="h-3.5 w-3.5 text-primary"
                strokeWidth={1.75}
              />
              CTC info
            </button>
            <button
              type="button"
              disabled={aiActionsDisabled}
              onClick={() => onMatchResume(job)}
              className="btn-secondary text-xs"
            >
              <Target
                className="h-3.5 w-3.5 text-success"
                strokeWidth={1.75}
              />
              Match resume
            </button>
            <a
              href={job.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={syncPending}
              className={cn(
                "btn-secondary text-xs text-primary",
                syncPending && "pointer-events-none opacity-50"
              )}
            >
              Open posting
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </a>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 rounded-xl border border-border bg-surface-inset px-4 py-3 sm:flex-col sm:items-end sm:py-4">
          <div className="text-right sm:w-full">
            <p className="kicker">Match</p>
            <div className="mt-0.5 flex items-center justify-end gap-2">
              <p className="text-xs font-medium text-foreground-secondary">
                {hasRelevance ? `${scorePct}%` : "—"}
              </p>
              {grade && (
                <span className="badge-amber">{grade}</span>
              )}
            </div>
          </div>
          <div className="text-right sm:w-full">
            <p className="kicker">Applied</p>
            <p className="mt-0.5 text-xs text-foreground-secondary">
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
