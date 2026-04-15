"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { saveBragSheet, saveResumeText } from "@/actions/user";
import { extractPdfText } from "@/lib/pdf/extractPdfText";
import {
  clearStoredResumeText,
  getStoredResumeText,
} from "@/lib/resume-storage";
import { cn } from "@/lib/cn";

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

type ResumeUploadProps = {
  initialResumeText: string | null;
  initialBragSheet: string | null;
};

export function ResumeUpload({
  initialResumeText,
  initialBragSheet,
}: ResumeUploadProps) {
  const inputId = useId();
  const [text, setText] = useState(initialResumeText ?? "");
  const [bragSheetDraft, setBragSheetDraft] = useState(initialBragSheet ?? "");
  const [savedBragSheet, setSavedBragSheet] = useState(initialBragSheet ?? "");
  const [savingBragSheet, setSavingBragSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const lastLoadedName = useRef<string | null>(null);
  const migrated = useRef(false);

  useEffect(() => {
    setText(initialResumeText ?? "");
  }, [initialResumeText]);

  useEffect(() => {
    const next = initialBragSheet ?? "";
    setBragSheetDraft(next);
    setSavedBragSheet(next);
  }, [initialBragSheet]);

  useEffect(() => {
    if (migrated.current) return;
    if (initialResumeText?.trim()) {
      migrated.current = true;
      return;
    }
    const local = getStoredResumeText();
    if (!local?.trim()) {
      migrated.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await saveResumeText(local);
      if (!cancelled && r.ok) {
        clearStoredResumeText();
        setText(local);
      }
      migrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [initialResumeText]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const extracted = await extractPdfText(file);
      if (!extracted) {
        setError("No text could be read from this PDF (try another export).");
        return;
      }
      lastLoadedName.current = file.name;
      const r = await saveResumeText(extracted);
      if (!r.ok) {
        setError(r.error ?? "Could not save resume to your account.");
        return;
      }
      setText(extracted);
      toast.success("Resume saved to your account.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read PDF.");
    } finally {
      setBusy(false);
    }
  }, []);

  const onInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) await handleFile(file);
    },
    [handleFile]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) await handleFile(file);
    },
    [handleFile]
  );

  const clear = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await saveResumeText("");
      if (!r.ok) {
        setError(r.error ?? "Could not clear resume.");
        return;
      }
      lastLoadedName.current = null;
      setText("");
      clearStoredResumeText();
      toast.success("Resume cleared.");
    } finally {
      setBusy(false);
    }
  }, []);

  const saveCareerHighlights = useCallback(async () => {
    setSavingBragSheet(true);
    setError(null);
    try {
      const r = await saveBragSheet(bragSheetDraft);
      if (!r.ok) {
        setError(r.error ?? "Could not save career highlights.");
        return;
      }
      const trimmed = bragSheetDraft.trim();
      setSavedBragSheet(trimmed);
      toast.success(
        trimmed ? "Career highlights saved." : "Career highlights cleared."
      );
    } finally {
      setSavingBragSheet(false);
    }
  }, [bragSheetDraft]);

  const hasBragSheetChanges = bragSheetDraft.trim() !== savedBragSheet.trim();

  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── PDF Drop Zone ──────────────────────────────── */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={onDrop}
          className={cn(
            "relative card border-dashed p-6 md:p-8",
            dragOver && "border-primary/50 bg-primary-subtle",
            busy && "pointer-events-none opacity-80"
          )}
        >
          <input
            id={inputId}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={onInputChange}
            disabled={busy}
          />

          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-inset">
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <UploadCloud
                  className="h-6 w-6 text-primary/80"
                  strokeWidth={1.75}
                />
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              Drop a resume PDF here
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              Parsed in your browser — PDF bytes are not uploaded; extracted
              text is saved to your account.
            </p>
            <label
              htmlFor={inputId}
              className={cn(
                "btn-secondary mt-4 cursor-pointer",
                busy && "cursor-not-allowed opacity-60"
              )}
            >
              Choose PDF
            </label>
          </div>
        </div>

        {/* ── Career Highlights ───────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Career Highlights &amp; Proof Points
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                Add hard stats, wins, and outcomes to improve fit scoring and
                tailored AI output.
              </p>
            </div>
            <button
              type="button"
              onClick={() => saveCareerHighlights()}
              disabled={savingBragSheet || !hasBragSheetChanges}
              className="btn-secondary text-sm"
            >
              {savingBragSheet ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  strokeWidth={1.75}
                />
              ) : null}
              Save
            </button>
          </div>
          <textarea
            value={bragSheetDraft}
            onChange={(e) => setBragSheetDraft(e.target.value)}
            placeholder="Example: Increased pipeline coverage from 68% to 97%; cut onboarding time by 35%; shipped 3 features adopted by 120k users."
            className="input mt-3 min-h-44"
          />
          <p className="mt-2 text-right text-xs text-foreground-muted">
            {bragSheetDraft.trim().length.toLocaleString()} characters
          </p>
        </div>
      </div>

      {error && <p className="callout-error">{error}</p>}

      {text.length > 0 && (
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileText
                className="mt-0.5 h-5 w-5 shrink-0 text-primary/70"
                strokeWidth={1.75}
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Saved resume text
                </p>
                <p className="text-xs text-foreground-muted">
                  {lastLoadedName.current
                    ? `Last PDF: ${lastLoadedName.current} · `
                    : null}
                  {text.length.toLocaleString()} characters ·{" "}
                  {wordCount(text).toLocaleString()} words
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => clear()}
              disabled={busy}
              className="btn-secondary text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Clear
            </button>
          </div>
          <div className="card-inset mt-4 max-h-64 overflow-y-auto p-4 text-left text-xs leading-relaxed text-foreground-secondary">
            <pre className="whitespace-pre-wrap font-sans">{text}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
