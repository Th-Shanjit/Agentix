"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { IOSToggle } from "@/components/ui/IOSToggle";
import { cn } from "@/lib/cn";

export type TrackerRow = {
  id: string;
  userId: string;
  company: string;
  url: string;
  active: boolean;
};

type TrackersPanelProps = {
  initialTrackers: TrackerRow[];
};

export function TrackersPanel({ initialTrackers }: TrackersPanelProps) {
  const [rows, setRows] = useState<TrackerRow[]>(initialTrackers);
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/trackers");
    if (!res.ok) throw new Error("fetch");
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("bad");
    setRows(data as TrackerRow[]);
  }, []);

  const addTracker = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const res = await fetch("/api/trackers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company, url }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            typeof j.error === "string" ? j.error : "Could not add tracker."
          );
        }
        setCompany("");
        setUrl("");
        await refresh();
        toast.success("Tracker added.");
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Could not add tracker.";
        setError(msg);
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [company, url, refresh]
  );

  const toggleActive = useCallback(
    async (id: string, active: boolean) => {
      setPendingId(id);
      setError(null);
      try {
        const res = await fetch(`/api/trackers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        });
        if (!res.ok) throw new Error();
        await refresh();
      } catch {
        setError("Could not update tracker.");
        toast.error("Could not update tracker.");
      } finally {
        setPendingId(null);
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      setPendingId(id);
      setError(null);
      try {
        const res = await fetch(`/api/trackers/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        await refresh();
        toast.success("Tracker removed.");
      } catch {
        setError("Could not delete tracker.");
        toast.error("Could not delete tracker.");
      } finally {
        setPendingId(null);
      }
    },
    [refresh]
  );

  return (
    <div className="space-y-6">
      <form
        onSubmit={addTracker}
        className="rounded-3xl border border-white/60 bg-white/40 p-5 shadow-glass backdrop-blur-2xl transition-all duration-300 md:p-6"
      >
        <p className="text-sm font-semibold text-slate-900">Add a source</p>
        <p className="mt-1 text-xs text-slate-600">
          Career site URLs your automation sends to{" "}
          <code className="rounded bg-white/50 px-1 py-0.5">/api/webhooks/cron-scraper</code>
          .
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-medium text-slate-600">
            Company
            <input
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="mt-1 w-full rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-sm text-slate-900 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 focus:border-violet-300/80"
              placeholder="Acme Inc."
            />
          </label>
          <label className="flex-[2] text-xs font-medium text-slate-600">
            URL
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1 w-full rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-sm text-slate-900 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 focus:border-violet-300/80"
              placeholder="https://careers.example.com/jobs"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-md backdrop-blur-xl transition-all duration-300",
              "hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
      </form>

      <section className="rounded-3xl border border-white/60 bg-white/35 p-5 shadow-glass backdrop-blur-2xl md:p-6">
        <h3 className="text-sm font-semibold text-slate-900">Your sources</h3>
        {rows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/50 bg-white/20 p-6 text-center backdrop-blur-sm">
            <p className="text-sm font-medium text-slate-800">
              No trackers yet
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Add a company name and careers page URL above. When your cron hits
              the webhook, new roles can land on the job board with source{" "}
              <code className="rounded bg-white/50 px-1 py-0.5 text-xs">
                Tracker
              </code>
              .
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/55 bg-white/40 p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{t.company}</p>
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-xs text-violet-700 underline-offset-2 hover:underline"
                  >
                    {t.url}
                  </a>
                </div>
                <div className="flex items-center gap-3 sm:shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Active
                    </p>
                  </div>
                  <IOSToggle
                    checked={t.active}
                    disabled={pendingId === t.id}
                    aria-label={`Toggle ${t.company} tracker`}
                    onChange={(next) => toggleActive(t.id, next)}
                  />
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    disabled={pendingId === t.id}
                    className="rounded-full border border-white/60 bg-white/45 p-2 text-slate-700 backdrop-blur-xl transition-all duration-300 hover:bg-white/65 disabled:opacity-50"
                    aria-label={`Delete ${t.company}`}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
