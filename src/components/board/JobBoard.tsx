"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, Plus, RefreshCw } from "lucide-react";
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
import { GlassModal } from "@/components/ui/GlassModal";
import { RadialScore } from "./RadialScore";
import type { JobDTO } from "@/lib/jobs";
import { normalizeJobFromApi } from "@/lib/jobs";
import { cn } from "@/lib/cn";

type JobBoardProps = {
  initialJobs: JobDTO[];
  userId: string;
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

export function JobBoard({ initialJobs, userId }: JobBoardProps) {
  const [jobs, setJobs] = useState<JobDTO[]>(initialJobs);

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

  const [matchLoading, setMatchLoading] = useState(false);
  const [matchData, setMatchData] = useState<AtsMatchResult | null>(null);
  const [matchErr, setMatchErr] = useState<MatchErrState>(null);

  const setBusy = useCallback((id: string, v: boolean) => {
    setBusyIds((m) => ({ ...m, [id]: v }));
  }, []);

  const closeAi = useCallback(() => {
    setAi(null);
    setCtcLoading(false);
    setCtcText(null);
    setCtcErr(null);
    setSaveCtcBusy(false);
    setMatchLoading(false);
    setMatchData(null);
    setMatchErr(null);
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

  const handleEstimateCtc = useCallback(async (job: JobDTO) => {
    setAi({ mode: "ctc", job });
    setCtcLoading(true);
    setCtcText(null);
    setCtcErr(null);
    const r = await estimateCTC(job.role, job.company);
    setCtcLoading(false);
    if (r.ok) setCtcText(r.text);
    else setCtcErr({ kind: "gemini", error: r.error });
  }, []);

  const retryEstimateCtc = useCallback(() => {
    if (!ai || ai.mode !== "ctc") return;
    void handleEstimateCtc(ai.job);
  }, [ai, handleEstimateCtc]);

  const saveCtcToJob = useCallback(async () => {
    if (!ai || ai.mode !== "ctc" || !ctcText?.trim()) return;
    setSaveCtcBusy(true);
    setCtcErr(null);
    try {
      const res = await fetch(`/api/jobs/${ai.job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctc: ctcText }),
      });
      if (!res.ok) throw new Error("save");
      const raw: unknown = await res.json();
      const updated = normalizeJobFromApi(raw);
      if (updated) {
        setJobs((list) =>
          list.map((j) => (j.id === updated.id ? { ...j, ...updated } : j))
        );
      }
      toast.success("CTC saved to this job.");
      closeAi();
    } catch {
      setCtcErr({
        kind: "save",
        message: "Could not save CTC to this job.",
      });
      toast.error("Could not save CTC to this job.");
    } finally {
      setSaveCtcBusy(false);
    }
  }, [ai, ctcText, closeAi]);

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
    const r = await matchResumeATS(text, job.role, job.company);
    setMatchLoading(false);
    if (r.ok) setMatchData(r.data);
    else setMatchErr({ kind: "gemini", error: r.error });
  }, []);

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
        source: "Manual",
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

  const empty = jobs.length === 0;

  const sorted = useMemo(
    () =>
      [...jobs].sort(
        (a, b) =>
          new Date(b.dateDiscovered).getTime() -
          new Date(a.dateDiscovered).getTime()
      ),
    [jobs]
  );

  const aiBusy = ctcLoading || matchLoading || saveCtcBusy;

  return (
    <div className="space-y-4">
      <GlassModal
        open={ai?.mode === "ctc"}
        onClose={closeAi}
        title="Estimated CTC (India)"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={closeAi}
              className="min-h-[44px] w-full rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-xs font-semibold text-slate-800 backdrop-blur-xl transition-all duration-300 hover:bg-white/65 active:scale-[0.99] sm:w-auto sm:min-h-0 sm:py-2"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!ctcText?.trim() || saveCtcBusy}
              onClick={() => saveCtcToJob()}
              className="min-h-[44px] w-full rounded-full border border-violet-400/50 bg-violet-500/90 px-4 py-2.5 text-xs font-semibold text-white shadow-sm backdrop-blur-xl transition-all duration-300 hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99] sm:w-auto sm:min-h-0 sm:py-2"
            >
              {saveCtcBusy ? "Saving…" : "Save to job"}
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
            {matchErr?.kind === "no_resume" && (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">No résumé text saved yet.</p>
                <p className="mt-1 text-amber-900/90">
                  Upload a PDF on{" "}
                  <Link
                    href="/profile"
                    className="font-semibold text-violet-800 underline underline-offset-2"
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
                    className="font-semibold text-violet-800 underline underline-offset-2"
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
        <section className="rounded-3xl border border-dashed border-white/50 bg-white/25 p-10 text-center shadow-inner backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/60 bg-white/45 shadow-inner backdrop-blur-md">
            <Briefcase className="h-7 w-7 text-violet-700/85" strokeWidth={1.5} />
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
                "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/90 px-5 py-2.5 text-xs font-semibold text-white shadow-md backdrop-blur-xl transition-all duration-300",
                "hover:bg-violet-600 active:scale-[0.99]"
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Add Job Manually
            </button>
          </div>
        </section>
      ) : (
        <ul className="space-y-4">
          {sorted.map((job) => (
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
