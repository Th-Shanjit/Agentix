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
import { saveResumeText } from "@/actions/user";
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
  /** Saved résumé text from Prisma (server). */
  initialResumeText: string | null;
};

export function ResumeUpload({ initialResumeText }: ResumeUploadProps) {
  const inputId = useId();
  const [text, setText] = useState(initialResumeText ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const lastLoadedName = useRef<string | null>(null);
  const migrated = useRef(false);

  useEffect(() => {
    setText(initialResumeText ?? "");
  }, [initialResumeText]);

  /** One-time migration from legacy localStorage → DB. */
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
        setError(r.error ?? "Could not save résumé to your account.");
        return;
      }
      setText(extracted);
      toast.success("Résumé saved to your account.");
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
        setError(r.error ?? "Could not clear résumé.");
        return;
      }
      lastLoadedName.current = null;
      setText("");
      clearStoredResumeText();
      toast.success("Résumé cleared.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="space-y-4">
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
          "relative rounded-3xl border border-dashed border-white/60 bg-white/35 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300 md:p-8",
          dragOver && "border-sky-400/60 bg-sky-50/30",
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
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/50 shadow-inner backdrop-blur-md">
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-sky-700" />
            ) : (
              <UploadCloud
                className="h-6 w-6 text-sky-700/90"
                strokeWidth={1.75}
              />
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900">
            Drop a résumé PDF here
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Parsed in your browser — PDF bytes are not uploaded; extracted text
            is saved to your account.
          </p>
          <label
            htmlFor={inputId}
            className={cn(
              "mt-4 inline-flex min-h-[44px] min-w-[10rem] cursor-pointer items-center justify-center rounded-full border border-white/60 bg-white/50 px-5 py-2.5 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 active:scale-[0.99]",
              "hover:border-sky-300/70 hover:bg-white/70",
              busy && "cursor-not-allowed opacity-60"
            )}
          >
            Choose PDF
          </label>
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800 backdrop-blur-sm">
          {error}
        </p>
      )}

      {text.length > 0 && (
        <div className="rounded-3xl border border-white/60 bg-white/40 p-5 shadow-glass backdrop-blur-2xl transition-all duration-300">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileText
                className="mt-0.5 h-5 w-5 shrink-0 text-sky-700/80"
                strokeWidth={1.75}
              />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Saved résumé text
                </p>
                <p className="text-xs text-slate-600">
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
              className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-3 py-1.5 text-xs font-semibold text-slate-800 backdrop-blur-xl transition-all duration-300 hover:bg-white/65 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Clear
            </button>
          </div>
          <div className="mt-4 max-h-64 overflow-y-auto rounded-2xl border border-white/50 bg-white/35 p-4 text-left text-xs leading-relaxed text-slate-800 shadow-inner backdrop-blur-md">
            <pre className="whitespace-pre-wrap font-sans">{text}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
