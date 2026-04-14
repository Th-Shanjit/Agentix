"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { addManualJob, toggleJobAppliedStatus } from "@/actions/jobs";
import {
  estimateCTC,
  matchResumeATS,
  type AtsMatchResult,
  type GeminiError,
} from "@/actions/gemini";
import { GeminiErrorCallout } from "./GeminiErrorCallout";
import { AddJobModal } from "./AddJobModal";
import { JobCard } from "./JobCard";
import { JobsImportUpload } from "@/components/profile/JobsImportUpload";
import { GlassModal } from "@/components/ui/GlassModal";
import { RadialScore } from "./RadialScore";
import type { JobDTO } from "@/lib/jobs";
import { normalizeJobFromApi } from "@/lib/jobs";
import { cn } from "@/lib/cn";

type JobBoardProps = {
  initialJobs: JobDTO[];
  userId: string;
  autoRefreshOnMount?: boolean;
};

type AiOpen =
  | null
  | { mode: "ctc"; job: JobDTO }
  | { mode: "match"; job: JobDTO };

/** Match modal errors: résumé fetch vs Gemini vs empty résumé. */
type MatchErrState =
  | null
  | { kind: "no_resume" }
  | { kind: "resume_fetch" }
  | { kind: "gemini"; error: GeminiError };

/** CTC modal: Gemini failures (retry → re-estimate) vs save failure (retry → save again). */
type CtcErrState =
  | null
  | { kind: "gemini"; error: GeminiError }
  | { kind: "save"; message: string };

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

export function JobBoard({
  initialJobs,
  userId,
  autoRefreshOnMount = false,
}: JobBoardProps) {
  const [jobs, setJobs] = useState<JobDTO[]>(initialJobs);
  const hasAutoRefreshed = useRef(false);

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [ai, setAi] = useState<AiOpen>(null);
  const [ctcLoading, setCtcLoading] = useState(false);
  const [ctcText, setCtcText] = useState<string | null>(null);
  const [ctcErr, setCtcErr] = useState<CtcErrState>(null);
  const [saveCtcBusy, setSaveCtcBusy] = useState(false);
  const [ctcRange, setCtcRange] = useState<JobDTO["ctcRange"]>(null);

  const [matchLoading, setMatchLoading] = useState(false);
  const [matchData, setMatchData] = useState<AtsMatchResult | null>(null);
  const [matchErr, setMatchErr] = useState<MatchErrState>(null);
  const [bulkEstimating, setBulkEstimating] = useState(false);
  const [jdInput, setJdInput] = useState("");
  const [tab, setTab] = useState<"all" | "applied" | "pending">("all");
  const [sortBy, setSortBy] = useState<"recent" | "ctc">("recent");
  const [searchQuery, setSearchQuery] = useState("");

  const setBusy = useCallback((id: string, v: boolean) => {
    setBusyIds((m) => ({ ...m, [id]: v }));
  }, []);

  const closeAi = useCallback(() => {
    setAi(null);
    setCtcLoading(false);
    setCtcText(null);
    setCtcRange(null);
    setCtcErr(null);
    setSaveCtcBusy(false);
    setMatchLoading(false);
    setMatchData(null);
    setMatchErr(null);
    setJdInput("");
  }, []);

  const handleAppliedChange = useCallback(
    async (id: string, applied: boolean) => {
      if (id.startsWith("temp-")) return;
      let previousApplied: boolean | undefined;
      setJobs((list) => {
        const current = list.find((j) => j.id === id);
        previousApplied = current?.applied;
        return list.map((j) => (j.id === id ? { ...j, applied } : j));
      });
      if (previousApplied === undefined) return;

      setBusy(id, true);
      try {
        const result = await toggleJobAppliedStatus(id, applied);
        if (!result.ok) {
          throw new Error(result.error);
        }
        setJobs((list) =>
          list.map((j) => (j.id === id ? { ...j, ...result.job } : j))
        );
      } catch {
        const revert = previousApplied;
        setJobs((list) =>
          list.map((j) => (j.id === id ? { ...j, applied: revert } : j))
        );
        toast.error("Could not update applied status.");
      } finally {
        setBusy(id, false);
      }
    },
    [setBusy]
  );

  const persistCtcEstimate = useCallback(
    async (
      jobId: string,
      text: string,
      range: NonNullable<JobDTO["ctcRange"]>
    ) => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctc: text, ctcRange: range }),
      });
      if (!res.ok) throw new Error("save");
      const raw: unknown = await res.json();
      const updated = normalizeJobFromApi(raw);
      if (updated) {
        setJobs((list) =>
          list.map((j) =>
            j.id === updated.id
              ? { ...j, ...updated, ctcRange: range, ctc: text }
              : j
          )
        );
      }
    },
    []
  );

  const handleEstimateCtc = useCallback(async (job: JobDTO) => {
    setAi({ mode: "ctc", job });
    setCtcErr(null);
    if (job.ctc?.trim() && job.ctcRange) {
      setCtcLoading(false);
      setCtcText(job.ctc);
      setCtcRange(job.ctcRange);
      return;
    }
    setCtcLoading(true);
    setCtcText(null);
    setCtcRange(null);
    const r = await estimateCTC(job.role, job.company, job.location);
    if (!r.ok) {
      setCtcLoading(false);
      setCtcErr({ kind: "gemini", error: r.error });
      return;
    }
    if (!r.range) {
      setCtcLoading(false);
      setCtcErr({
        kind: "save",
        message: "Estimate returned without a valid range.",
      });
      return;
    }
    try {
      setSaveCtcBusy(true);
      await persistCtcEstimate(job.id, r.text, r.range);
      setCtcText(r.text);
      setCtcRange(r.range);
    } catch {
      setCtcErr({
        kind: "save",
        message: "Could not persist CTC info for this job.",
      });
    } finally {
      setSaveCtcBusy(false);
      setCtcLoading(false);
    }
  }, [persistCtcEstimate]);

  const retryEstimateCtc = useCallback(() => {
    if (!ai || ai.mode !== "ctc") return;
    void handleEstimateCtc(ai.job);
  }, [ai, handleEstimateCtc]);

  const handleMatchResume = useCallback(async (job: JobDTO) => {
    setAi({ mode: "match", job });
    setMatchData(null);
    setMatchErr(null);

    const res = await fetch("/api/user/resume");
    if (!res.ok) {
      setMatchErr({ kind: "resume_fetch" });
      return;
    }
    const payload: unknown = await res.json();
    const text =
      payload &&
      typeof payload === "object" &&
      "text" in payload &&
      typeof (payload as { text: unknown }).text === "string"
        ? (payload as { text: string }).text
        : null;
    if (!text?.trim()) {
      setMatchErr({ kind: "no_resume" });
      return;
    }

    setMatchLoading(true);
    const r = await matchResumeATS(
      text,
      job.role,
      job.company,
      job.description ?? jdInput
    );
    setMatchLoading(false);
    if (r.ok) setMatchData(r.data);
    else setMatchErr({ kind: "gemini", error: r.error });
  }, [jdInput]);

  const retryMatchResume = useCallback(() => {
    if (!ai || ai.mode !== "match") return;
    void handleMatchResume(ai.job);
  }, [ai, handleMatchResume]);

  const handleManualAdd = useCallback(
    async (data: { company: string; role: string; url: string }) => {
      if (!userId) {
        toast.error("Sign in to add jobs.");
        return;
      }
      setAddSubmitting(true);
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: JobDTO = {
        id: tempId,
        userId,
        company: data.company.trim(),
        role: data.role.trim(),
        link: data.url.trim(),
        applied: false,
        dateDiscovered: new Date().toISOString(),
        ctc: null,
      };
      setJobs((prev) => [optimistic, ...prev]);
      setAddOpen(false);
      try {
        const result = await addManualJob({
          company: data.company,
          role: data.role,
          url: data.url,
        });
        if (result.ok) {
          setJobs((prev) =>
            prev.map((j) => (j.id === tempId ? result.job : j))
          );
          toast.success("Job added.");
        } else {
          setJobs((prev) => prev.filter((j) => j.id !== tempId));
          toast.error(result.error);
        }
      } catch {
        setJobs((prev) => prev.filter((j) => j.id !== tempId));
        toast.error("Could not add job.");
      } finally {
        setAddSubmitting(false);
      }
    },
    [userId]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/jobs", { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: unknown = await res.json();
      if (!Array.isArray(raw)) throw new Error("Bad payload");
      const next: JobDTO[] = [];
      for (const item of raw) {
        const j = normalizeJobFromApi(item);
        if (j) next.push(j);
      }
      setJobs(next);
    } catch {
      toast.error("Could not refresh jobs.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!autoRefreshOnMount || hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;
    void refresh();
  }, [autoRefreshOnMount, refresh]);

  const scoped = useMemo(() => {
    if (tab === "applied") return jobs.filter((j) => j.applied);
    if (tab === "pending") return jobs.filter((j) => !j.applied);
    return jobs;
  }, [jobs, tab]);

  const sorted = useMemo(() => {
    const copy = [...scoped];
    if (sortBy === "ctc") {
      return copy.sort((a, b) => {
        const va = a.ctcRange?.mid ?? -1;
        const vb = b.ctcRange?.mid ?? -1;
        if (vb !== va) return vb - va;
        return (
          new Date(b.dateDiscovered).getTime() -
          new Date(a.dateDiscovered).getTime()
        );
      });
    }
    return copy.sort(
      (a, b) =>
        new Date(b.dateDiscovered).getTime() -
        new Date(a.dateDiscovered).getTime()
    );
  }, [scoped, sortBy]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((j) => {
      const hay =
        `${j.role} ${j.company} ${j.location ?? ""} ${j.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [searchQuery, sorted]);

  const empty = filtered.length === 0;
  const bulkEligible = sorted.filter(
    (j) => !j.id.startsWith("temp-") && !j.notYetListed
  );

  const aiBusy = ctcLoading || matchLoading || saveCtcBusy || bulkEstimating;

  const estimateAllVisibleCtc = useCallback(async () => {
    if (bulkEligible.length === 0) {
      toast.message("No eligible listings to estimate.");
      return;
    }
    setBulkEstimating(true);
    let success = 0;
    let failed = 0;
    for (const job of bulkEligible) {
      try {
        const r = await estimateCTC(job.role, job.company, job.location);
        if (!r.ok || !r.range) {
          failed += 1;
          continue;
        }
        const res = await fetch(`/api/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ctc: r.text, ctcRange: r.range }),
        });
        if (!res.ok) {
          failed += 1;
          continue;
        }
        const raw: unknown = await res.json();
        const updated = normalizeJobFromApi(raw);
        if (updated) {
          setJobs((list) =>
            list.map((j) =>
              j.id === updated.id
                ? { ...j, ...updated, ctcRange: r.range, ctc: r.text }
                : j
            )
          );
        }
        success += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkEstimating(false);
    toast.success(`CTC estimated for ${success} listing${success === 1 ? "" : "s"}.`);
    if (failed > 0) {
      toast.message(`${failed} listing${failed === 1 ? "" : "s"} could not be estimated.`);
    }
  }, [bulkEligible]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <GlassModal
        open={ai?.mode === "ctc"}
        onClose={closeAi}
        title="CTC information"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={closeAi}
              className="min-h-[44px] w-full rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-xs font-semibold text-slate-800 backdrop-blur-xl transition-all duration-300 hover:bg-white/65 active:scale-[0.99] sm:w-auto sm:min-h-0 sm:py-2"
            >
              Close
            </button>
          </div>
        }
      >
        {ai?.mode === "ctc" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              {ai.job.role} · {ai.job.company}
            </p>
            {ctcLoading && (
              <p className="text-sm text-slate-600">Asking Gemini…</p>
            )}
            {ctcErr?.kind === "gemini" && (
              <GeminiErrorCallout
                error={ctcErr.error}
                onRetry={retryEstimateCtc}
                retryBusy={ctcLoading}
              />
            )}
            {ctcErr?.kind === "save" && (
              <p className="rounded-xl border border-red-200/80 bg-red-50/90 px-3 py-2 text-sm text-red-800">
                {ctcErr.message}
              </p>
            )}
            {ctcText && (
              <div className="whitespace-pre-wrap rounded-2xl border border-white/50 bg-white/35 p-4 text-sm leading-relaxed text-slate-800">
                {ctcText}
              </div>
            )}
            {ctcRange && (
              <p className="rounded-xl border border-sky-200/70 bg-sky-50/80 px-3 py-2 text-xs text-sky-900">
                Estimated range metadata: {formatRangeLabel(ctcRange)}
              </p>
            )}
          </div>
        )}
      </GlassModal>

      <GlassModal
        open={ai?.mode === "match"}
        onClose={closeAi}
        title="ATS-style match"
        wide
      >
        {ai?.mode === "match" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              {ai.job.role} · {ai.job.company}
            </p>
            {!ai.job.description && (
              <label className="block text-xs font-medium text-slate-600">
                Job description (optional fallback)
                <textarea
                  value={jdInput}
                  onChange={(e) => setJdInput(e.target.value)}
                  rows={4}
                  placeholder="Paste role summary if posting has no description."
                  className="mt-1 w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-2 text-xs text-slate-800"
                />
              </label>
            )}
            {matchErr?.kind === "no_resume" && (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">No résumé text saved yet.</p>
                <p className="mt-1 text-amber-900/90">
                  Upload a PDF on{" "}
                  <Link
                    href="/profile"
                    className="font-semibold text-sky-800 underline underline-offset-2"
                    onClick={closeAi}
                  >
                    Profile
                  </Link>
                  . Text is extracted in your browser and stored on your account.
                </p>
              </div>
            )}
            {matchErr?.kind === "resume_fetch" && (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">Could not load your saved résumé.</p>
                <p className="mt-1 text-amber-900/90">
                  Refresh the page or re-upload on{" "}
                  <Link
                    href="/profile"
                    className="font-semibold text-sky-800 underline underline-offset-2"
                    onClick={closeAi}
                  >
                    Profile
                  </Link>
                  , then try again.
                </p>
              </div>
            )}
            {matchErr?.kind === "gemini" && (
              <GeminiErrorCallout
                error={matchErr.error}
                onRetry={retryMatchResume}
                retryBusy={matchLoading}
              />
            )}
            {matchLoading && (
              <p className="text-sm text-slate-600">Analyzing résumé with Gemini…</p>
            )}
            {matchData && !matchLoading && (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <RadialScore percentage={matchData.matchPercentage} />
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-sm font-medium text-slate-900">
                    {matchData.verdict}
                  </p>
                  {matchData.strengths.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Strengths
                      </p>
                      <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                        {matchData.strengths.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {matchData.missingKeywords.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Gaps / keywords
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {matchData.missingKeywords.map((k) => (
                          <span
                            key={k}
                            className="rounded-full border border-white/60 bg-white/40 px-2.5 py-0.5 text-xs text-slate-800"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </GlassModal>

      <AddJobModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleManualAdd}
        submitting={addSubmitting}
      />

      <JobsImportUpload onImported={refresh} />

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          strokeWidth={1.75}
        />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Quick search listings..."
          className="w-full rounded-2xl border border-white/60 bg-white/45 py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm backdrop-blur-xl placeholder:text-slate-500"
        />
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max items-center gap-2 pb-1">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={cn(
              "min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-semibold",
              tab === "all"
                ? "border-sky-400/50 bg-sky-500/90 text-white"
                : "border-white/60 bg-white/45 text-slate-700"
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setTab("applied")}
            className={cn(
              "min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-semibold",
              tab === "applied"
                ? "border-sky-400/50 bg-sky-500/90 text-white"
                : "border-white/60 bg-white/45 text-slate-700"
            )}
          >
            Applied
          </button>
          <button
            type="button"
            onClick={() => setTab("pending")}
            className={cn(
              "min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-semibold",
              tab === "pending"
                ? "border-sky-400/50 bg-sky-500/90 text-white"
                : "border-white/60 bg-white/45 text-slate-700"
            )}
          >
            Not Applied
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value === "ctc" ? "ctc" : "recent")}
            className="min-h-[40px] rounded-full border border-white/60 bg-white/45 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            <option value="recent">Sort: Recent</option>
            <option value="ctc">Sort: CTC estimate</option>
          </select>
          <button
            type="button"
            onClick={() => void estimateAllVisibleCtc()}
            disabled={aiBusy || bulkEligible.length === 0}
            className={cn(
              "min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-semibold",
              "border-sky-400/50 bg-sky-500/90 text-white",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {bulkEstimating ? "Estimating all..." : "Estimate all CTC"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={!userId || addSubmitting}
            className={cn(
              "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 sm:w-auto sm:min-h-0 sm:py-2",
              "hover:bg-white/65 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
            )}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Quick add
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={refreshing}
            className={cn(
              "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 sm:w-auto sm:min-h-0 sm:py-2",
              "hover:bg-white/65 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
            )}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              strokeWidth={1.75}
            />
            Refresh
          </button>
        </div>
      </div>

      {empty ? (
        <section className="rounded-3xl border border-dashed border-white/50 bg-white/25 p-6 text-center shadow-inner backdrop-blur-xl sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/60 bg-white/45 shadow-inner backdrop-blur-md">
            <Briefcase className="h-7 w-7 text-sky-700/85" strokeWidth={1.5} />
          </div>
          <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900">
            Your job tracker is empty
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
            Start building your personal pipeline by adding your first application.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className={cn(
                "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/90 px-5 py-2.5 text-xs font-semibold text-white shadow-md backdrop-blur-xl transition-all duration-300",
                "hover:bg-sky-600 active:scale-[0.99]"
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Add Job Manually
            </button>
          </div>
        </section>
      ) : (
        <ul className="space-y-4">
          {filtered.map((job) => (
            <li key={job.id}>
              <JobCard
                job={job}
                busy={Boolean(busyIds[job.id])}
                aiBusy={aiBusy}
                pendingSync={job.id.startsWith("temp-")}
                onAppliedChange={handleAppliedChange}
                onEstimateCtc={handleEstimateCtc}
                onMatchResume={handleMatchResume}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
