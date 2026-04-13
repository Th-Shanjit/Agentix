"use client";

import { useCallback, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { JobCard } from "./JobCard";
import type { JobDTO } from "@/lib/jobs";
import { normalizeJobFromApi } from "@/lib/jobs";
import { cn } from "@/lib/cn";

type JobBoardProps = {
  initialJobs: JobDTO[];
};

export function JobBoard({ initialJobs }: JobBoardProps) {
  const [jobs, setJobs] = useState<JobDTO[]>(initialJobs);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const setBusy = useCallback((id: string, v: boolean) => {
    setBusyIds((m) => ({ ...m, [id]: v }));
  }, []);

  const handleAppliedChange = useCallback(
    async (id: string, applied: boolean) => {
      let previousApplied: boolean | undefined;
      setJobs((list) => {
        const current = list.find((j) => j.id === id);
        previousApplied = current?.applied;
        return list.map((j) => (j.id === id ? { ...j, applied } : j));
      });
      if (previousApplied === undefined) return;

      setBusy(id, true);
      try {
        const res = await fetch(`/api/jobs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applied }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw: unknown = await res.json();
        const updated = normalizeJobFromApi(raw);
        if (updated) {
          setJobs((list) =>
            list.map((j) => (j.id === id ? { ...j, ...updated } : j))
          );
        }
      } catch {
        const revert = previousApplied;
        setJobs((list) =>
          list.map((j) => (j.id === id ? { ...j, applied: revert } : j))
        );
      } finally {
        setBusy(id, false);
      }
    },
    [setBusy]
  );

  const refresh = useCallback(async () => {
    setRefreshError(null);
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
      setRefreshError("Could not refresh jobs.");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {refreshError && (
          <p className="mr-auto text-sm text-red-600">{refreshError}</p>
        )}
        <button
          type="button"
          onClick={() => refresh()}
          disabled={refreshing}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300",
            "hover:bg-white/65 disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            strokeWidth={1.75}
          />
          Refresh
        </button>
      </div>

      {empty ? (
        <section className="rounded-3xl border border-dashed border-white/50 bg-white/25 p-10 text-center shadow-inner backdrop-blur-xl">
          <p className="text-sm font-medium text-slate-700">No jobs yet</p>
          <p className="mt-2 text-sm text-slate-500">
            Add rows via{" "}
            <code className="rounded-md bg-white/50 px-1.5 py-0.5 text-xs">
              POST /api/jobs
            </code>
            , your GitHub scraper webhook, or the next in-app form.
          </p>
        </section>
      ) : (
        <ul className="space-y-4">
          {sorted.map((job) => (
            <li key={job.id}>
              <JobCard
                job={job}
                busy={Boolean(busyIds[job.id])}
                onAppliedChange={handleAppliedChange}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
