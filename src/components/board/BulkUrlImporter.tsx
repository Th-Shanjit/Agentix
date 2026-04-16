"use client";

import { useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importJobsFromUrls } from "@/actions/jobs";
import { track } from "@vercel/analytics";

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
      track("import_urls_started", { urls: parsedUrls.length });
      const result = await importJobsFromUrls(parsedUrls);
      if (!result.ok) {
        toast.error(result.error);
        track("import_urls_failed");
        return;
      }
      toast.success(
        `Imported ${result.addedCount} jobs from URLs.` +
          (result.skippedCount > 0 ? ` Skipped ${result.skippedCount}.` : "")
      );
      track("import_urls_completed", {
        addedCount: result.addedCount,
        skippedCount: result.skippedCount,
      });
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
    <section className="card p-5">
      <h3 className="section-heading">Bulk URL importer</h3>
      <p className="section-desc mt-1">
        Paste one job URL per line. We fetch each page, parse ATS APIs when
        available, and import extracted role details.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://boards.greenhouse.io/company/jobs/12345&#10;https://jobs.lever.co/company/abc123"
        className="input mt-4 min-h-36"
        disabled={busy}
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-foreground-muted">
          {parsedUrls.length} URL{parsedUrls.length === 1 ? "" : "s"} detected
        </p>
        <button
          type="button"
          onClick={() => void onImport()}
          disabled={busy || parsedUrls.length === 0}
          className="btn-primary text-xs"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Import URLs
        </button>
      </div>
      {busy && (
        <div className="callout-info mt-3 text-xs">
          Importing {parsedUrls.length} URL{parsedUrls.length === 1 ? "" : "s"}…
        </div>
      )}
      {notes.length > 0 && (
        <div className="callout-warn mt-4 text-xs">
          {notes.slice(0, 6).map((n) => (
            <p key={n}>{n}</p>
          ))}
          {notes.length > 6 && <p>...and {notes.length - 6} more</p>}
        </div>
      )}
    </section>
  );
}
