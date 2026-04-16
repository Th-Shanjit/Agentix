"use client";

import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { track } from "@vercel/analytics";

type SetupChecklistCardProps = {
  hasResume: boolean;
  hasPrefs: boolean;
  hasJobs: boolean;
};

const DISMISS_KEY = "agentix_setup_checklist_dismissed";

function Item({
  done,
  label,
  href,
  hint,
}: {
  done: boolean;
  label: string;
  href?: string;
  hint?: string;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  const content = (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          done ? "text-success" : "text-foreground-muted/70"
        )}
        strokeWidth={1.75}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", done ? "text-foreground" : "text-foreground-secondary")}>
          {label}
        </p>
        {hint && (
          <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl border border-border bg-surface px-3 py-2 transition-colors hover:bg-surface-hover"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      {content}
    </div>
  );
}

export function SetupChecklistCard({ hasResume, hasPrefs, hasJobs }: SetupChecklistCardProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const progress = useMemo(() => {
    const steps = [hasResume, hasPrefs, hasJobs];
    return steps.filter(Boolean).length;
  }, [hasResume, hasPrefs, hasJobs]);

  useEffect(() => {
    track("onboarding_setup_progress", {
      hasResume,
      hasPrefs,
      hasJobs,
      progress,
    });
  }, [hasResume, hasPrefs, hasJobs, progress]);

  const complete = progress === 3;
  if (dismissed || complete) return null;

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="section-heading">Quick setup</h3>
          <p className="section-desc mt-1">
            Finish these once and imports + AI features work much better.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-border bg-surface p-2 text-foreground-secondary transition-colors hover:bg-surface-hover active:scale-[0.98]"
          aria-label="Dismiss setup checklist"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // ignore
            }
            track("onboarding_setup_dismiss");
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Item
          done={hasResume}
          label="Upload your resume"
          href="/profile"
          hint="We use the extracted text for matching and job detail insights."
        />
        <Item
          done={hasPrefs}
          label="Set your job preferences"
          href="/profile"
          hint="Used to filter imports and improve relevance."
        />
        <Item
          done={hasJobs}
          label="Import or add your first job"
          hint="Use the import tools below, or Quick add."
        />
      </div>

      <p className="mt-3 text-xs text-foreground-muted">
        Setup progress: <span className="font-medium text-foreground">{progress}/3</span>
      </p>
    </section>
  );
}

