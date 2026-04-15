"use client";

import { useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importJobsFromUrls } from "@/actions/jobs";
import { cn } from "@/lib/cn";

type BulkUrlImporterProps = {
  onImported?: () => void | Promise<void>;
};

export function BulkUrlImporter({ onImported }: BulkUrlImporterProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);

  const parsedUrls = useMemo(() => {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [value]);

  async function onImport() {
    setBusy(true);
    setNotes([]);
    try {
      const result = await importJobsFromUrls(parsedUrls);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Imported ${result.addedCount} jobs from URLs.` +
          (result.skippedCount > 0 ? ` Skipped ${result.skippedCount}.` : "")
      );
      setNotes(result.notes);
      if (result.addedCount > 0) {
        setValue("");
        if (onImported) await onImported();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
      <h3 className="text-lg font-semibold text-slate-900">Bulk URL importer</h3>
      <p className="mt-1 text-sm text-slate-600">
        Paste one job URL per line. We fetch each page, parse ATS APIs when
        available, and import extracted role details.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://boards.greenhouse.io/company/jobs/12345&#10;https://jobs.lever.co/company/abc123"
        className="mt-4 min-h-36 w-full rounded-2xl border border-white/60 bg-white/50 p-3 text-base text-slate-900 shadow-inner backdrop-blur-md placeholder:text-slate-500 sm:text-sm"
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          {parsedUrls.length} URL{parsedUrls.length === 1 ? "" : "s"} detected
        </p>
        <button
          type="button"
          onClick={() => void onImport()}
          disabled={busy || parsedUrls.length === 0}
          className={cn(
            "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-sky-400/50 bg-sky-500/90 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:bg-sky-600",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Import URLs
        </button>
      </div>
      {notes.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/90 p-3 text-xs text-amber-900">
          {notes.slice(0, 6).map((n) => (
            <p key={n}>{n}</p>
          ))}
          {notes.length > 6 && <p>...and {notes.length - 6} more</p>}
        </div>
      )}
    </section>
  );
}
