"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { track } from "@vercel/analytics";
import { useEffect } from "react";

export function JobDetailErrorView({
  message,
  jobId,
}: {
  message: string;
  jobId: string;
}) {
  useEffect(() => {
    track("job_detail_load_failed", { jobId });
  }, [jobId]);

  return (
    <div className="space-y-6">
      <header className="card p-5">
        <h2 className="section-heading text-2xl">Job details</h2>
        <p className="section-desc mt-1.5 max-w-2xl">
          We couldn’t load AI enrichment for this job right now.
        </p>
      </header>

      <section className="callout-warn">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 opacity-80" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Temporary error</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">
              {message}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn-primary w-full sm:w-auto"
                onClick={() => {
                  track("job_detail_retry_click", { jobId });
                  window.location.reload();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Try again
              </button>
              <Link href="/board" className="btn-secondary w-full sm:w-auto">
                Back to board
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

