"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { computeAndCacheMatches } from "@/actions/search-match";
import { saveJobToMyList } from "@/actions/jobs";
import { HoverTip } from "@/components/ui/HoverTip";
import { cn } from "@/lib/cn";

export type SearchJobRow = {
  id: string;
  company: string;
  role: string;
  location: string | null;
  ctc: string | null;
  link: string;
  postedAt: string;
  source: string;
  remotePolicy: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  match: {
    fitScore: number;
    upsideScore: number;
    relevanceScore: number;
    strengths: unknown;
    weaknesses: unknown;
  } | null;
};

function bullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string").slice(0, 6);
}

export function SearchPanel() {
  const [q, setQ] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [expMin, setExpMin] = useState("");
  const [expMax, setExpMax] = useState("");
  const [country, setCountry] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [sort, setSort] = useState<"recent" | "relevance">("recent");

  const [jobs, setJobs] = useState<SearchJobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (salaryMin) p.set("salaryMin", salaryMin);
    if (salaryMax) p.set("salaryMax", salaryMax);
    if (expMin) p.set("expMin", expMin);
    if (expMax) p.set("expMax", expMax);
    if (country.trim()) p.set("country", country.trim());
    if (remoteOnly) p.set("remoteOnly", "1");
    p.set("sort", sort);
    return p.toString();
  }, [q, salaryMin, salaryMax, expMin, expMax, country, remoteOnly, sort]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search/jobs?${queryString}`);
      if (!res.ok) {
        // #region agent log
        fetch("http://127.0.0.1:7789/ingest/469f7bf6-046a-4f8e-b523-c0b19a42773e", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "9c4d2d",
          },
          body: JSON.stringify({
            sessionId: "9c4d2d",
            hypothesisId: "H3",
            location: "SearchPanel.tsx:runSearch_notOk",
            message: "search API non-OK",
            data: { status: res.status },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        throw new Error("Search failed");
      }
      const data: unknown = await res.json();
      const j =
        data && typeof data === "object" && "jobs" in data
          ? (data as { jobs: SearchJobRow[] }).jobs
          : [];
      setJobs(Array.isArray(j) ? j : []);
    } catch {
      // #region agent log
      fetch("http://127.0.0.1:7789/ingest/469f7bf6-046a-4f8e-b523-c0b19a42773e", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "9c4d2d",
        },
        body: JSON.stringify({
          sessionId: "9c4d2d",
          hypothesisId: "H3",
          location: "SearchPanel.tsx:runSearch_catch",
          message: "search fetch threw or non-OK",
          data: {},
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      toast.error("Could not load results.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const runMatch = useCallback(async () => {
    if (jobs.length === 0) {
      toast.message("Run a search first.");
      return;
    }
    setMatching(true);
    try {
      const r = await computeAndCacheMatches(jobs.map((j) => j.id));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Updated match for ${r.updated} roles.`);
      await runSearch();
    } finally {
      setMatching(false);
    }
  }, [jobs, runSearch]);

  const saveOne = useCallback(
    async (id: string) => {
      setSavingId(id);
      try {
        const r = await saveJobToMyList(id);
        if (!r.ok) throw new Error(r.error);
        toast.success("Saved to My jobs.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save.");
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        <p className="mt-1 text-sm text-slate-600">
          Search the catalog. Run <strong>AI match</strong> after uploading a
          résumé on Profile.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs font-medium text-slate-600">
            Keywords
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Role or company"
              className="mt-1 w-full rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Salary min (annual)
            <input
              inputMode="numeric"
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              placeholder="e.g. 80000"
              className="mt-1 w-full rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Salary max
            <input
              inputMode="numeric"
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Exp. years (min)
            <input
              inputMode="numeric"
              value={expMin}
              onChange={(e) => setExpMin(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Exp. years (max)
            <input
              inputMode="numeric"
              value={expMax}
              onChange={(e) => setExpMax(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Country / region text
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. India, UK"
              className="mt-1 w-full rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
            />
          </label>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            className="rounded border-white/60"
          />
          Remote-friendly only
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-slate-600">
            Sort{" "}
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value === "relevance" ? "relevance" : "recent")
              }
              className="ml-2 rounded-full border border-white/60 bg-white/50 px-3 py-1.5 text-sm"
            >
              <option value="recent">Newest first</option>
              <option value="relevance">Match score (needs AI match)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-violet-400/50 bg-violet-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-violet-600 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" strokeWidth={1.75} />
            )}
            Search
          </button>
          <button
            type="button"
            onClick={() => void runMatch()}
            disabled={matching || jobs.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/50 px-5 py-2.5 text-sm font-semibold text-slate-800 backdrop-blur-xl transition hover:bg-white/70 disabled:opacity-50"
          >
            {matching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-violet-700" strokeWidth={1.75} />
            )}
            AI match
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {jobs.length === 0 && !loading && (
          <p className="text-center text-sm text-slate-500">
            No results yet. Adjust filters and tap Search.
          </p>
        )}
        {jobs.map((job) => {
          const st = bullets(job.match?.strengths);
          const wk = bullets(job.match?.weaknesses);
          const tip = (
            <ul className="list-inside list-disc space-y-1">
              <li className="font-medium text-emerald-800">Strengths</li>
              {st.length ? (
                st.map((s) => <li key={s}>{s}</li>)
              ) : (
                <li>Run AI match after saving résumé.</li>
              )}
              <li className="pt-1 font-medium text-amber-800">Gaps</li>
              {wk.length ? (
                wk.map((s) => <li key={s}>{s}</li>)
              ) : (
                <li>—</li>
              )}
            </ul>
          );

          return (
            <article
              key={job.id}
              className="rounded-3xl border border-white/60 bg-white/40 p-5 shadow-glass backdrop-blur-2xl"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-lg font-semibold text-violet-900 hover:underline"
                    >
                      {job.role}
                    </Link>
                    <span className="rounded-full bg-white/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                      {job.source}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{job.company}</p>
                  <p className="text-xs text-slate-500">
                    {job.location ?? "Location not listed"}
                    {job.remotePolicy ? ` · ${job.remotePolicy}` : ""}
                  </p>
                  {job.ctc && (
                    <p className="text-sm font-medium text-violet-800/90">
                      {job.ctc}
                    </p>
                  )}
                  {job.description && (
                    <p className="line-clamp-2 text-xs text-slate-600">
                      {job.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    <HoverTip
                      label={
                        <span>
                          <span className="font-semibold text-slate-900">
                            Fit
                          </span>
                          : how well your résumé matches today.
                        </span>
                      }
                    >
                      <span className="cursor-help rounded-full border border-emerald-300/60 bg-emerald-50/90 px-3 py-1 text-xs font-semibold text-emerald-900">
                        Fit {job.match ? `${Math.round(job.match.fitScore)}%` : "—"}
                      </span>
                    </HoverTip>
                    <HoverTip label={tip}>
                      <span className="cursor-help rounded-full border border-amber-300/60 bg-amber-50/90 px-3 py-1 text-xs font-semibold text-amber-900">
                        Upside{" "}
                        {job.match ? `${Math.round(job.match.upsideScore)}%` : "—"}
                      </span>
                    </HoverTip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingId === job.id}
                      onClick={() => void saveOne(job.id)}
                      className="rounded-full border border-white/60 bg-white/50 px-3 py-1.5 text-xs font-semibold text-slate-800 backdrop-blur-xl hover:bg-white/70 disabled:opacity-50"
                    >
                      {savingId === job.id ? "Saving…" : "Save to My jobs"}
                    </button>
                    <a
                      href={job.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-white/60 bg-white/50 px-3 py-1.5 text-xs font-semibold text-violet-800 backdrop-blur-xl hover:bg-white/70"
                    >
                      Posting
                    </a>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
