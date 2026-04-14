"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  generateFiveResumeTonesAction,
  type JobDetailPayload,
} from "@/actions/job-detail";
import { cn } from "@/lib/cn";

type JobDetailViewProps = {
  initial: JobDetailPayload;
  jobListingId: string;
};

export function JobDetailView({ initial, jobListingId }: JobDetailViewProps) {
  const [data] = useState(initial);
  const [tonesBusy, setTonesBusy] = useState(false);
  const [tones, setTones] = useState<
    { tone: string; text: string }[] | null
  >(() => {
    const raw = data.enrichment?.fiveToneResumes;
    if (Array.isArray(raw)) {
      const v = raw.filter(
        (x): x is { tone: string; text: string } =>
          x &&
          typeof x === "object" &&
          typeof (x as { tone?: string }).tone === "string" &&
          typeof (x as { text?: string }).text === "string"
      );
      return v.length ? v : null;
    }
    return null;
  });
  const [copied, setCopied] = useState<string | null>(null);

  const bands = data.enrichment?.ctcBands as
    | {
        low?: number;
        mid?: number;
        high?: number;
        currency?: string;
        credibilityNote?: string;
      }
    | undefined;

  const ratings = data.enrichment?.ratingsWeb as
    | {
        glassdoorSummary?: string;
        ambitionBoxSummary?: string;
        disclaimer?: string;
      }
    | undefined;

  const forum = data.enrichment?.forumSentiment as
    | {
        summary?: string;
        label?: string;
        disclaimer?: string;
      }
    | undefined;

  async function runTones() {
    setTonesBusy(true);
    try {
      const r = await generateFiveResumeTonesAction(jobListingId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setTones(r.variants);
      toast.success("Résumé variants ready.");
    } finally {
      setTonesBusy(false);
    }
  }

  async function copyText(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/board"
          className="rounded-full border border-white/60 bg-white/40 px-3 py-1.5 font-medium text-slate-700 backdrop-blur-xl hover:bg-white/60"
        >
          ← My jobs
        </Link>
      </div>

      <header className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
        <h1 className="text-2xl font-semibold text-slate-900">
          {data.listing.title}
        </h1>
        <p className="mt-1 text-lg text-slate-700">{data.listing.company}</p>
        <p className="mt-2 text-sm text-slate-600">
          {data.listing.location ?? "Location unknown"}
          {data.listing.remotePolicy
            ? ` · ${data.listing.remotePolicy}`
            : ""}
        </p>
        {data.listing.ctc && (
          <p className="mt-2 text-sm font-medium text-sky-900">
            Listed: {data.listing.ctc}
          </p>
        )}
        <a
          href={data.listing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-300/50 bg-sky-500/90 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
        >
          Open posting
          <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
        </a>
      </header>

      {bands && (
        <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
          <h2 className="text-lg font-semibold text-slate-900">
            Compensation bands (estimate)
          </h2>
          <p className="mt-1 text-xs text-amber-800">
            AI estimate — not verified. {bands.credibilityNote ?? ""}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Low", bands.low],
              ["Mid", bands.mid],
              ["High", bands.high],
            ].map(([label, val]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/50 bg-white/35 p-4 text-center backdrop-blur-xl"
              >
                <p className="text-xs font-medium uppercase text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {typeof val === "number"
                    ? `${bands.currency ?? ""} ${val.toLocaleString()}`.trim()
                    : "—"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {ratings && (
        <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
          <h2 className="text-lg font-semibold text-slate-900">
            Employer reputation (summary)
          </h2>
          <p className="mt-1 text-xs text-amber-900">{ratings.disclaimer}</p>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Public-style (Glassdoor-like)
              </p>
              <p className="mt-1">{ratings.glassdoorSummary}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">
                India-style (AmbitionBox-like)
              </p>
              <p className="mt-1">{ratings.ambitionBoxSummary}</p>
            </div>
          </div>
        </section>
      )}

      {forum && (
        <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
          <h2 className="text-lg font-semibold text-slate-900">
            Forum / social tone
          </h2>
          <p className="text-xs text-amber-900">{forum.disclaimer}</p>
          <p className="mt-2 text-sm font-medium text-slate-800">
            {forum.label}
          </p>
          <p className="mt-1 text-sm text-slate-700">{forum.summary}</p>
        </section>
      )}

      {data.listing.description && (
        <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
          <h2 className="text-lg font-semibold text-slate-900">Description</h2>
          <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {data.listing.description}
          </div>
        </section>
      )}

      {data.enrichment && (
        <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
          <h2 className="text-lg font-semibold text-slate-900">
            Résumé vs role
          </h2>
          <p className="mt-2 text-3xl font-bold text-sky-900">
            {data.enrichment.resumeGrade != null
              ? `${Math.round(data.enrichment.resumeGrade)} / 100`
              : "—"}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-700">
                Strengths
              </p>
              <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                {data.enrichment.resumeStrengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-amber-800">
                Weaknesses
              </p>
              <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                {data.enrichment.resumeWeaknesses.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase text-slate-600">
              Fix next
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
              {data.enrichment.areasToFix.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            ATS-style résumé (5 tones)
          </h2>
          <button
            type="button"
            disabled={tonesBusy}
            onClick={() => void runTones()}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-sky-400/50 bg-sky-500/90 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 disabled:opacity-50"
            )}
          >
            {tonesBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Generate / refresh
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Plain text for pasting. Review before you submit applications.
        </p>
        {tones && tones.length > 0 && (
          <div className="mt-4 space-y-4">
            {tones.map((t) => (
              <div
                key={t.tone}
                className="rounded-2xl border border-white/50 bg-white/35 p-4 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {t.tone}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyText(t.text, t.tone)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/50 px-3 py-1 text-xs font-medium text-slate-800"
                  >
                    {copied === t.tone ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy
                  </button>
                </div>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                  {t.text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
