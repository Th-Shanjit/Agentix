"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Briefcase, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { track } from "@vercel/analytics";
import { addManualJob, toggleJobAppliedStatus } from "@/actions/jobs";
import {
  batchEstimateCTC,
  estimateCTC,
  matchResumeATS,
  type AtsMatchResult,
  type GeminiError,
} from "@/actions/gemini";
import { GeminiErrorCallout } from "./GeminiErrorCallout";
import { AddJobModal } from "./AddJobModal";
import { JobCard } from "./JobCard";
import { JobsImportUpload } from "@/components/profile/JobsImportUpload";
import { BulkUrlImporter } from "@/components/board/BulkUrlImporter";
import { GlassModal } from "@/components/ui/GlassModal";
import { RadialScore } from "./RadialScore";
import { SetupChecklistCard } from "@/components/board/SetupChecklistCard";
import type { JobDTO } from "@/lib/jobs";
import { normalizeJobFromApi } from "@/lib/jobs";
import { cn } from "@/lib/cn";
import { relevanceScoreToLetterGrade } from "@/lib/grades";

type JobBoardProps = {
  initialJobs: JobDTO[];
  userId: string;
  autoRefreshOnMount?: boolean;
  setup?: { hasResume: boolean; hasPrefs: boolean; hasJobs: boolean };
};

type AiOpen =
  | null
  | { mode: "ctc"; job: JobDTO }
  | { mode: "match"; job: JobDTO };

type MatchErrState =
  | null
  | { kind: "no_resume" }
  | { kind: "resume_fetch" }
  | { kind: "gemini"; error: GeminiError };

type CtcErrState =
  | null
  | { kind: "gemini"; error: GeminiError }
  | { kind: "save"; message: string };

type SortOption = "recent_desc" | "recent_asc" | "ctc_desc" | "ctc_asc";

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

export function JobBoard({
  initialJobs,
  userId,
  autoRefreshOnMount = false,
  setup,
}: JobBoardProps) {
  const { data: session, status: sessionStatus } = useSession();
  const effectiveUserId = session?.user?.id ?? userId ?? "";

  const [jobs, setJobs] = useState<JobDTO[]>(initialJobs);
  const hasAutoRefreshed = useRef(false);
  const sessionJobsSynced = useRef(false);

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
  const [sortBy, setSortBy] = useState<SortOption>("recent_desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [ruthlessMode, setRuthlessMode] = useState(false);
  const ctcEstimateOptsRef = useRef<{ forceRefresh: boolean }>({
    forceRefresh: false,
  });

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
        track("job_applied_toggle", { applied });
        const result = await toggleJobAppliedStatus(id, applied);
        if (!result.ok) {
          throw new Error(result.error);
        }
        setJobs((list) =>
          list.map((j) => (j.id === id ? { ...j, ...result.job } : j))
        );
        track("job_applied_toggle_success", { applied });
      } catch {
        const revert = previousApplied;
        setJobs((list) =>
          list.map((j) => (j.id === id ? { ...j, applied: revert } : j))
        );
        toast.error("Could not update applied status.");
        track("job_applied_toggle_failed", { applied });
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

  const handleEstimateCtc = useCallback(
    async (job: JobDTO, opts?: { forceRefresh?: boolean }) => {
      const forceRefresh = opts?.forceRefresh === true;
      ctcEstimateOptsRef.current = { forceRefresh };
      setAi({ mode: "ctc", job });
      setCtcErr(null);
      track("ai_ctc_started", { forceRefresh });
      if (!forceRefresh && job.ctc?.trim() && job.ctcRange) {
        setCtcLoading(false);
        setCtcText(job.ctc);
        setCtcRange(job.ctcRange);
        track("ai_ctc_cache_hit");
        return;
      }
      setCtcLoading(true);
      setCtcText(null);
      setCtcRange(null);
      const r = await estimateCTC(job.role, job.company, job.location, {
        inrOnly: true,
      });
      if (!r.ok) {
        setCtcLoading(false);
        setCtcErr({ kind: "gemini", error: r.error });
        track("ai_ctc_failed", { code: r.error.code });
        return;
      }
      if (!r.range) {
        setCtcLoading(false);
        setCtcErr({
          kind: "save",
          message: "Estimate returned without a valid range.",
        });
        track("ai_ctc_failed", { code: "range_missing" });
        return;
      }
      try {
        setSaveCtcBusy(true);
        await persistCtcEstimate(job.id, r.text, r.range);
        setCtcText(r.text);
        setCtcRange(r.range);
        track("ai_ctc_succeeded", { confidence: r.range.confidence ?? "LOW" });
      } catch {
        setCtcErr({
          kind: "save",
          message: "Could not persist CTC info for this job.",
        });
        track("ai_ctc_failed", { code: "persist_failed" });
      } finally {
        setSaveCtcBusy(false);
        setCtcLoading(false);
      }
    },
    [persistCtcEstimate]
  );

  const retryEstimateCtc = useCallback(() => {
    if (!ai || ai.mode !== "ctc") return;
    void handleEstimateCtc(ai.job, {
      forceRefresh: ctcEstimateOptsRef.current.forceRefresh,
    });
  }, [ai, handleEstimateCtc]);

  const redoEstimateCtc = useCallback(() => {
    if (!ai || ai.mode !== "ctc") return;
    void handleEstimateCtc(ai.job, { forceRefresh: true });
  }, [ai, handleEstimateCtc]);

  const handleMatchResume = useCallback(
    async (job: JobDTO) => {
      setAi({ mode: "match", job });
      setMatchData(null);
      setMatchErr(null);
      track("ai_match_started");

      const res = await fetch("/api/user/resume");
      if (!res.ok) {
        setMatchErr({ kind: "resume_fetch" });
        track("ai_match_failed", { code: "resume_fetch" });
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
        track("ai_match_failed", { code: "no_resume" });
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
      if (r.ok) {
        setMatchData(r.data);
        track("ai_match_succeeded", { matchPercentage: r.data.matchPercentage });
      } else {
        setMatchErr({ kind: "gemini", error: r.error });
        track("ai_match_failed", { code: r.error.code });
      }
    },
    [jdInput]
  );

  const retryMatchResume = useCallback(() => {
    if (!ai || ai.mode !== "match") return;
    void handleMatchResume(ai.job);
  }, [ai, handleMatchResume]);

  const handleManualAdd = useCallback(
    async (data: { company: string; role: string; url: string }) => {
      if (!effectiveUserId) {
        toast.error("Sign in to add jobs.");
        return;
      }
      setAddSubmitting(true);
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: JobDTO = {
        id: tempId,
        userId: effectiveUserId,
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
    [effectiveUserId]
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
    if (!session?.user?.id) {
      sessionJobsSynced.current = false;
    }
  }, [session?.user?.id]);

  useEffect(() => {
    const sid = session?.user?.id;
    if (!sid || userId) return;
    if (sessionJobsSynced.current) return;
    sessionJobsSynced.current = true;
    void refresh();
  }, [session?.user?.id, userId, refresh]);

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
    switch (sortBy) {
      case "recent_asc":
        return copy.sort(
          (a, b) =>
            new Date(a.dateDiscovered).getTime() -
            new Date(b.dateDiscovered).getTime()
        );
      case "ctc_desc":
        return copy.sort((a, b) => {
          const aHasCtc = a.ctcRange?.mid != null;
          const bHasCtc = b.ctcRange?.mid != null;
          if (aHasCtc !== bHasCtc) return aHasCtc ? -1 : 1;
          const va = a.ctcRange?.mid ?? 0;
          const vb = b.ctcRange?.mid ?? 0;
          if (vb !== va) return vb - va;
          return (
            new Date(b.dateDiscovered).getTime() -
            new Date(a.dateDiscovered).getTime()
          );
        });
      case "ctc_asc":
        return copy.sort((a, b) => {
          const aHasCtc = a.ctcRange?.mid != null;
          const bHasCtc = b.ctcRange?.mid != null;
          if (aHasCtc !== bHasCtc) return aHasCtc ? -1 : 1;
          const va = a.ctcRange?.mid ?? 0;
          const vb = b.ctcRange?.mid ?? 0;
          if (va !== vb) return va - vb;
          return (
            new Date(b.dateDiscovered).getTime() -
            new Date(a.dateDiscovered).getTime()
          );
        });
      case "recent_desc":
      default:
        return copy.sort(
          (a, b) =>
            new Date(b.dateDiscovered).getTime() -
            new Date(a.dateDiscovered).getTime()
        );
    }
  }, [scoped, sortBy]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const searched = !q
      ? sorted
      : sorted.filter((j) => {
          const hay =
            `${j.role} ${j.company} ${j.location ?? ""} ${j.description ?? ""} ${j.archetype ?? ""}`.toLowerCase();
          return hay.includes(q);
        });
    return ruthlessMode
      ? searched.filter((j) => {
          if (
            typeof j.relevanceScore !== "number" ||
            !Number.isFinite(j.relevanceScore)
          ) {
            return true;
          }
          const grade = relevanceScoreToLetterGrade(
            Math.round(j.relevanceScore)
          );
          return grade === "A" || grade === "B";
        })
      : searched;
  }, [ruthlessMode, searchQuery, sorted]);

  const empty = filtered.length === 0;
  const bulkEligible = sorted.filter(
    (j) => !j.id.startsWith("temp-") && !j.notYetListed
  );

  const modalAiBusy = ctcLoading || matchLoading || saveCtcBusy;

  const estimateAllVisibleCtc = useCallback(async () => {
    if (bulkEligible.length === 0) {
      toast.message("No eligible listings to estimate.");
      return;
    }
    setBulkEstimating(true);
    track("ai_ctc_bulk_started", { count: bulkEligible.length });
    try {
      const inputs = bulkEligible.map((j) => ({
        id: j.id,
        jobRole: j.role,
        company: j.company,
        location: j.location ?? undefined,
      }));

      const batchResult = await batchEstimateCTC(inputs, { inrOnly: true });
      if (!batchResult.ok) {
        toast.error(batchResult.error.message);
        track("ai_ctc_bulk_failed", { code: batchResult.error.code });
        return;
      }

      const rowsWithRange = batchResult.rows.filter(
        (r): r is typeof r & { range: NonNullable<typeof r.range> } =>
          r.range != null
      );
      let failed = batchResult.rows.length - rowsWithRange.length;
      let success = 0;

      const saved: Array<{
        id: string;
        text: string;
        range: NonNullable<JobDTO["ctcRange"]>;
        normalized: JobDTO;
      }> = [];

      const chunkSize = 5;
      for (let i = 0; i < rowsWithRange.length; i += chunkSize) {
        const chunk = rowsWithRange.slice(i, i + chunkSize);
        const outcomes = await Promise.all(
          chunk.map(async (row) => {
            try {
              const res = await fetch(`/api/jobs/${row.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ctc: row.summary,
                  ctcRange: row.range,
                }),
              });
              if (!res.ok) return null;
              const raw: unknown = await res.json();
              const normalized = normalizeJobFromApi(raw);
              if (!normalized) return null;
              return {
                id: row.id,
                text: row.summary,
                range: row.range,
                normalized,
              };
            } catch {
              return null;
            }
          })
        );
        for (const o of outcomes) {
          if (o) {
            success += 1;
            saved.push(o);
          } else {
            failed += 1;
          }
        }
      }

      if (saved.length > 0) {
        const byId = new Map(saved.map((s) => [s.id, s]));
        setJobs((list) =>
          list.map((j) => {
            const s = byId.get(j.id);
            if (!s) return j;
            return {
              ...j,
              ...s.normalized,
              ctcRange: s.range,
              ctc: s.text,
            };
          })
        );
      }

      toast.success(
        `CTC estimated for ${success} listing${success === 1 ? "" : "s"}.`
      );
      track("ai_ctc_bulk_completed", { success, failed });
      if (failed > 0) {
        toast.message(
          `${failed} listing${failed === 1 ? "" : "s"} could not be estimated.`
        );
      }
    } finally {
      setBulkEstimating(false);
    }
  }, [bulkEligible]);

  const tabBtn = (
    label: string,
    value: typeof tab,
    current: typeof tab,
    onClick: () => void
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn text-sm",
        current === value
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-foreground-secondary hover:bg-surface-hover"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {setup && (
        <SetupChecklistCard
          hasResume={setup.hasResume}
          hasPrefs={setup.hasPrefs}
          hasJobs={setup.hasJobs}
        />
      )}
      {/* ── CTC Modal ──────────────────────────────────────────── */}
      <GlassModal
        open={ai?.mode === "ctc"}
        onClose={closeAi}
        title="CTC information"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" onClick={closeAi} className="btn-secondary w-full sm:w-auto">
              Close
            </button>
            <button
              type="button"
              onClick={redoEstimateCtc}
              disabled={ctcLoading || saveCtcBusy}
              className="btn-primary w-full sm:w-auto"
              title="Regenerate INR CTC estimate"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Redo estimate
            </button>
          </div>
        }
      >
        {ai?.mode === "ctc" && (
          <div className="space-y-3">
            <p className="text-xs text-foreground-muted">
              {ai.job.role} · {ai.job.company}
            </p>
            {ctcLoading && (
              <p className="text-sm text-foreground-muted">Asking Gemini…</p>
            )}
            {ctcErr?.kind === "gemini" && (
              <GeminiErrorCallout
                error={ctcErr.error}
                onRetry={retryEstimateCtc}
                retryBusy={ctcLoading}
              />
            )}
            {ctcErr?.kind === "save" && (
              <p className="callout-error">{ctcErr.message}</p>
            )}
            {ctcText && (
              <div className="card-inset whitespace-pre-wrap p-4 text-sm leading-relaxed text-foreground-secondary">
                {ctcText}
              </div>
            )}
            {ctcRange && (
              <div className="callout-info flex flex-wrap items-center gap-2">
                <span>Estimated range metadata: {formatRangeLabel(ctcRange)}</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    ctcConfidenceBadgeClass(ctcRange.confidence)
                  )}
                >
                  {ctcConfidenceLabel(ctcRange.confidence)}
                </span>
                <span className="text-xs text-foreground-muted">
                  Confidence reflects how reliable the estimate is.
                </span>
              </div>
            )}
          </div>
        )}
      </GlassModal>

      {/* ── Match Modal ────────────────────────────────────────── */}
      <GlassModal
        open={ai?.mode === "match"}
        onClose={closeAi}
        title="ATS-style match"
        wide
      >
        {ai?.mode === "match" && (
          <div className="space-y-4">
            <p className="text-xs text-foreground-muted">
              {ai.job.role} · {ai.job.company}
            </p>
            {!ai.job.description && (
              <div>
                <label htmlFor="jd-fallback" className="label">
                  Job description (optional fallback)
                </label>
                <textarea
                  id="jd-fallback"
                  value={jdInput}
                  onChange={(e) => setJdInput(e.target.value)}
                  rows={4}
                  placeholder="Paste role summary if posting has no description."
                  className="input mt-1.5"
                />
              </div>
            )}
            {matchErr?.kind === "no_resume" && (
              <div className="callout-warn">
                <p className="font-medium">No resume text saved yet.</p>
                <p className="mt-1">
                  Upload a PDF on{" "}
                  <Link
                    href="/profile"
                    className="font-medium text-primary underline underline-offset-2"
                    onClick={closeAi}
                  >
                    Profile
                  </Link>
                  . Text is extracted in your browser and stored on your
                  account.
                </p>
              </div>
            )}
            {matchErr?.kind === "resume_fetch" && (
              <div className="callout-warn">
                <p className="font-medium">
                  Could not load your saved resume.
                </p>
                <p className="mt-1">
                  Refresh the page or re-upload on{" "}
                  <Link
                    href="/profile"
                    className="font-medium text-primary underline underline-offset-2"
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
              <p className="text-sm text-foreground-muted">
                Analyzing resume with Gemini…
              </p>
            )}
            {matchData && !matchLoading && (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <RadialScore percentage={matchData.matchPercentage} />
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {matchData.verdict}
                  </p>
                  {matchData.strengths.length > 0 && (
                    <div>
                      <p className="kicker">Strengths</p>
                      <ul className="mt-1 list-inside list-disc text-sm text-foreground-secondary">
                        {matchData.strengths.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {matchData.missingKeywords.length > 0 && (
                    <div>
                      <p className="kicker">Gaps / keywords</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {matchData.missingKeywords.map((k) => (
                          <span
                            key={k}
                            className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-foreground-secondary"
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
      <BulkUrlImporter onImported={refresh} />

      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
          strokeWidth={1.75}
        />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Quick search listings..."
          className="input pl-9"
        />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="-mx-1 overflow-x-auto px-1 scrollbar-none">
        <div className="flex min-w-max items-center gap-2 pb-1">
          {tabBtn("All", "all", tab, () => setTab("all"))}
          {tabBtn("Applied", "applied", tab, () => setTab("applied"))}
          {tabBtn("Not Applied", "pending", tab, () => setTab("pending"))}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="input w-auto min-w-0"
          >
            <option value="recent_desc">Recent (Newest to Oldest)</option>
            <option value="recent_asc">Recent (Oldest to Newest)</option>
            <option value="ctc_desc">CTC (Highest to Lowest)</option>
            <option value="ctc_asc">CTC (Lowest to Highest)</option>
          </select>
          <button
            type="button"
            onClick={() => void estimateAllVisibleCtc()}
            disabled={bulkEstimating || bulkEligible.length === 0}
            className="btn-primary text-sm"
          >
            {bulkEstimating ? "Estimating all..." : "Estimate all CTC"}
          </button>
          <button
            type="button"
            onClick={() => setRuthlessMode((v) => !v)}
            className={cn(
              "btn text-sm",
              ruthlessMode
                ? "border-red-400 bg-red-500 text-white"
                : "border-border bg-surface text-foreground-secondary hover:bg-surface-hover"
            )}
          >
            Ruthless Mode (Hide &lt; B Grade)
          </button>
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={
              sessionStatus === "loading" || !effectiveUserId || addSubmitting
            }
            className="btn-secondary w-full sm:w-auto"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Quick add
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={refreshing}
            className="btn-secondary w-full sm:w-auto"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              strokeWidth={1.75}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Job list / empty ───────────────────────────────────── */}
      {empty ? (
        <section className="card border-dashed p-8 text-center sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface-inset">
            <Briefcase
              className="h-7 w-7 text-primary/70"
              strokeWidth={1.5}
            />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            Your job tracker is empty
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-foreground-secondary">
            Start building your personal pipeline by adding your first
            application.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={
                sessionStatus === "loading" ||
                !effectiveUserId ||
                addSubmitting
              }
              className="btn-primary"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Add Job Manually
            </button>
          </div>
        </section>
      ) : (
        <ul className="space-y-3">
          {filtered.map((job) => (
            <li key={job.id}>
              <JobCard
                job={job}
                busy={Boolean(busyIds[job.id])}
                aiBusy={
                  bulkEstimating ||
                  (ai?.job.id === job.id && modalAiBusy)
                }
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
