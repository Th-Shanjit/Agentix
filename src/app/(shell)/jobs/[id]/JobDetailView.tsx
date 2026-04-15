"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Copy, Check, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  generateFiveResumeTonesAction,
  type JobDetailPayload,
} from "@/actions/job-detail";
import { cn } from "@/lib/cn";
import { TailoredResumePDF } from "@/components/jobs/TailoredResumePDF";

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
  const [selectedTone, setSelectedTone] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [prepTab, setPrepTab] = useState<"stories" | "negotiation">("stories");
  const pdfRef = useRef<HTMLDivElement | null>(null);

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

  const interviewStories = Array.isArray(data.enrichment?.interviewStories)
    ? data.enrichment.interviewStories
        .filter(
          (x): x is {
            title: string;
            situation: string;
            task: string;
            action: string;
            result: string;
          } =>
            Boolean(x) &&
            typeof x === "object" &&
            typeof (x as { title?: string }).title === "string" &&
            typeof (x as { situation?: string }).situation === "string" &&
            typeof (x as { task?: string }).task === "string" &&
            typeof (x as { action?: string }).action === "string" &&
            typeof (x as { result?: string }).result === "string"
        )
        .slice(0, 5)
    : [];

  const negotiationScripts = Array.isArray(data.enrichment?.negotiationStrategy)
    ? data.enrichment.negotiationStrategy
        .filter(
          (x): x is { scenario: string; script: string } =>
            Boolean(x) &&
            typeof x === "object" &&
            typeof (x as { scenario?: string }).scenario === "string" &&
            typeof (x as { script?: string }).script === "string"
        )
        .slice(0, 3)
    : [];

  const selectedVariant = useMemo(() => {
    if (!tones || tones.length === 0) return null;
    return tones.find((t) => t.tone === selectedTone) ?? tones[0];
  }, [selectedTone, tones]);

  async function runTones() {
    setTonesBusy(true);
    try {
      const r = await generateFiveResumeTonesAction(jobListingId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setTones(r.variants);
      setSelectedTone((prev) =>
        prev && r.variants.some((v) => v.tone === prev)
          ? prev
          : (r.variants[0]?.tone ?? null)
      );
      toast.success("Résumé variants ready.");
    } finally {
      setTonesBusy(false);
    }
  }

  async function downloadTailoredPdf() {
    if (!selectedVariant) {
      toast.error("Generate tone variants first.");
      return;
    }
    const node = pdfRef.current;
    if (!node) {
      toast.error("Could not prepare PDF render.");
      return;
    }
    setPdfBusy(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const safeTone = selectedVariant.tone.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const safeCompany = data.listing.company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await html2pdf()
        .set({
          filename: `tailored-ats-${safeCompany}-${safeTone || "resume"}.pdf`,
          margin: [0, 0, 0, 0],
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
        })
        .from(node)
        .save();
      toast.success("Tailored ATS PDF downloaded.");
    } catch {
      toast.error("Could not generate PDF.");
    } finally {
      setPdfBusy(false);
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

      {data.enrichment && (
        <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Interview Prep & Negotiation
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                AI-generated coaching based on your resume, brag sheet, and this
                role.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-white/60 bg-white/45 p-1 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setPrepTab("stories")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  prepTab === "stories"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-700 hover:bg-white/70"
                )}
              >
                Interview Stories
              </button>
              <button
                type="button"
                onClick={() => setPrepTab("negotiation")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  prepTab === "negotiation"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-700 hover:bg-white/70"
                )}
              >
                Negotiation Scripts
              </button>
            </div>
          </div>

          {prepTab === "stories" ? (
            <div className="mt-4 space-y-3">
              {interviewStories.length > 0 ? (
                interviewStories.map((story, idx) => (
                  <article
                    key={`${story.title}-${idx}`}
                    className="rounded-2xl border border-indigo-200/60 bg-indigo-50/45 p-4 backdrop-blur-xl"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-indigo-900">
                        {idx + 1}. {story.title}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(
                            `Title: ${story.title}\n\nSituation: ${story.situation}\n\nTask: ${story.task}\n\nAction: ${story.action}\n\nResult: ${story.result}`,
                            `story-${idx}`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-indigo-300/60 bg-white/65 px-3 py-1 text-xs font-medium text-indigo-900"
                      >
                        {copied === `story-${idx}` ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy STAR
                      </button>
                    </div>
                    <dl className="mt-3 space-y-2 text-sm text-slate-700">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                          Situation
                        </dt>
                        <dd className="mt-0.5">{story.situation}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                          Task
                        </dt>
                        <dd className="mt-0.5">{story.task}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                          Action
                        </dt>
                        <dd className="mt-0.5">{story.action}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                          Result
                        </dt>
                        <dd className="mt-0.5">{story.result}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              ) : (
                <p className="rounded-2xl border border-indigo-200/60 bg-indigo-50/45 px-4 py-3 text-sm text-indigo-900">
                  Interview stories are not available yet for this role.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {negotiationScripts.length > 0 ? (
                negotiationScripts.map((item, idx) => (
                  <article
                    key={`${item.scenario}-${idx}`}
                    className="rounded-2xl border border-emerald-200/70 bg-emerald-50/45 p-4 backdrop-blur-xl"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-emerald-900">
                        {item.scenario}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyText(item.script, `neg-${idx}`)}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-white/65 px-3 py-1 text-xs font-medium text-emerald-900"
                      >
                        {copied === `neg-${idx}` ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy script
                      </button>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                      {item.script}
                    </pre>
                  </article>
                ))
              ) : (
                <p className="rounded-2xl border border-emerald-200/70 bg-emerald-50/45 px-4 py-3 text-sm text-emerald-900">
                  Negotiation scripts are not available yet for this role.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            ATS-style résumé (5 tones)
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pdfBusy || !selectedVariant}
              onClick={() => void downloadTailoredPdf()}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              )}
            >
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Download Tailored ATS PDF
            </button>
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
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Plain text for pasting. Review before you submit applications. Choose a
          tone, then download a client-side ATS PDF.
        </p>
        {tones && tones.length > 0 && (
          <div className="mt-4 space-y-4">
            {tones.map((t) => (
              <div
                key={t.tone}
                className={cn(
                  "rounded-2xl border border-white/50 bg-white/35 p-4 backdrop-blur-xl",
                  selectedVariant?.tone === t.tone &&
                    "border-emerald-300/80 bg-emerald-50/40"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTone(t.tone)}
                    className="text-sm font-semibold text-slate-900 hover:text-emerald-800"
                  >
                    {t.tone}
                    {selectedVariant?.tone === t.tone ? " (Selected)" : ""}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTone(t.tone)}
                      className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/50 px-3 py-1 text-xs font-medium text-slate-800"
                    >
                      Use tone
                    </button>
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
                </div>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                  {t.text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>
      {selectedVariant && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-[-10000px] top-0 opacity-0"
        >
          <TailoredResumePDF
            ref={pdfRef}
            tone={selectedVariant.tone}
            resumeText={selectedVariant.text}
            role={data.listing.title}
            company={data.listing.company}
          />
        </div>
      )}
    </div>
  );
}
