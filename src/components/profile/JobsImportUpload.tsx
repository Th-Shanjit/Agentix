"use client";

import { useMemo, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importUploadJobs, type UploadJobInput } from "@/actions/jobs";
import {
  mapImportRowsWithGemini,
  type ImportMappingAudit,
} from "@/actions/gemini-job-features";
import { cn } from "@/lib/cn";

/** Keeps each Server Action POST under platform body limits (long descriptions dominate size). */
const IMPORT_JOBS_CHUNK_SIZE = 45;

/** AI mapping sends `rows` as the RPC body — the server only maps a slice; the full array must be chunked client-side. */
const GEMINI_MAP_CHUNK_SIZE = 35;

/** Avoid huge cells in generic CSV/JSON rows blowing the Server Action payload. */
const GEMINI_MAP_MAX_CELL_CHARS = 6_000;

/** Cap description length for `importUploadJobs` (each chunk must stay under host body limits). */
const IMPORT_MAX_DESCRIPTION_CHARS = 12_000;

/** Parallel Gemini map / import calls per wave — stay under API rate limits. */
const MAP_IMPORT_CONCURRENCY = 4;

type ParseResult = {
  rows: UploadJobInput[];
  errors: string[];
};

type GenericRow = Record<string, unknown>;

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file);
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cell.trim());
      cell = "";
      continue;
    }
    cell += ch;
  }
  out.push(cell.trim());
  return out;
}

function parseCsv(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["CSV must include a header and at least one row."] };
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const companyIdx = idx("company");
  const roleIdx = idx("role");
  const linkIdx = idx("link");
  if (companyIdx === -1 || roleIdx === -1 || linkIdx === -1) {
    return {
      rows: [],
      errors: ["CSV headers must include: company, role, link."],
    };
  }
  const errors: string[] = [];
  const rows: UploadJobInput[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const company = cols[companyIdx] ?? "";
    const role = cols[roleIdx] ?? "";
    const link = cols[linkIdx] ?? "";
    if (!company || !role || !link) {
      errors.push(`Row ${i + 1}: missing company/role/link.`);
      continue;
    }
    rows.push({
      company,
      role,
      link,
      source: cols[idx("source")] ?? "Upload",
      description: cols[idx("description")] ?? null,
      location: cols[idx("location")] ?? null,
      remotePolicy: cols[idx("remotepolicy")] ?? null,
      ctc: cols[idx("ctc")] ?? null,
      dateDiscovered: cols[idx("datediscovered")] ?? null,
    });
  }
  return { rows, errors };
}

function mapByKnownKeys(rows: GenericRow[]): UploadJobInput[] {
  const pick = (obj: GenericRow, keys: string[]) => {
    for (const key of keys) {
      const found = Object.keys(obj).find(
        (k) => k.trim().toLowerCase() === key.toLowerCase()
      );
      if (!found) continue;
      const v = obj[found];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const mapped: UploadJobInput[] = [];
  for (const row of rows) {
    const company = pick(row, ["company", "companyname", "employer", "organization"]);
    const role = pick(row, ["role", "title", "jobtitle", "job_title", "position"]);
    const link = pick(row, ["link", "url", "applyurl", "apply_url", "joburl", "job_url"]);
    if (!company || !role || !link) continue;
    mapped.push({
      company,
      role,
      link,
      source: pick(row, ["source", "platform"]) || null,
      description: pick(row, ["description", "jobdescription", "details"]) || null,
      location: pick(row, ["location", "city", "country"]) || null,
      remotePolicy: pick(row, ["remotepolicy", "remote", "workmode", "work_mode"]) || null,
      ctc: pick(row, ["ctc", "salary", "compensation"]) || null,
      dateDiscovered: pick(row, ["datediscovered", "date", "postedat", "posted_at"]) || null,
    });
  }
  return mapped;
}

function parseCsvToGenericRows(text: string): { rows: GenericRow[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { rows: [], errors: ["CSV must include a header and at least one row."] };
  }
  const header = parseCsvLine(lines[0]);
  const rows: GenericRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row: GenericRow = {};
    for (let j = 0; j < header.length; j += 1) {
      row[header[j]] = cols[j] ?? "";
    }
    rows.push(row);
  }
  return { rows, errors: [] };
}

function truncateGenericRowCells(rows: GenericRow[], maxChars: number): GenericRow[] {
  return rows.map((row) => {
    const next: GenericRow = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && v.length > maxChars) {
        next[k] = v.slice(0, maxChars);
      } else {
        next[k] = v;
      }
    }
    return next;
  });
}

function truncateJobsForImportPayload(jobs: UploadJobInput[]): UploadJobInput[] {
  return jobs.map((j) => {
    const d = j.description;
    if (d && d.length > IMPORT_MAX_DESCRIPTION_CHARS) {
      return { ...j, description: d.slice(0, IMPORT_MAX_DESCRIPTION_CHARS) };
    }
    return j;
  });
}

async function mapImportRowsWithGeminiInChunks(genericRows: GenericRow[]): Promise<
  | { ok: true; rows: UploadJobInput[]; audit: ImportMappingAudit[] }
  | { ok: false; message: string }
> {
  if (genericRows.length === 0) {
    return { ok: true, rows: [], audit: [] };
  }
  const mergedRows: UploadJobInput[] = [];
  const mergedAudit: ImportMappingAudit[] = [];
  const totalChunks = Math.ceil(genericRows.length / GEMINI_MAP_CHUNK_SIZE);
  const totalBatches = Math.ceil(totalChunks / MAP_IMPORT_CONCURRENCY);

  for (let batchStart = 0; batchStart < totalChunks; batchStart += MAP_IMPORT_CONCURRENCY) {
    const batchEnd = Math.min(batchStart + MAP_IMPORT_CONCURRENCY, totalChunks);
    const batchNum = Math.floor(batchStart / MAP_IMPORT_CONCURRENCY) + 1;
    if (totalChunks > 1) {
      toast.message(
        `Mapping schema: wave ${batchNum} of ${totalBatches} (chunks ${batchStart + 1}–${batchEnd} of ${totalChunks}, up to ${MAP_IMPORT_CONCURRENCY} in parallel)…`
      );
    }
    const wave = await Promise.all(
      Array.from({ length: batchEnd - batchStart }, (_, i) => {
        const c = batchStart + i;
        const slice = genericRows.slice(
          c * GEMINI_MAP_CHUNK_SIZE,
          (c + 1) * GEMINI_MAP_CHUNK_SIZE
        );
        const trimmed = truncateGenericRowCells(slice, GEMINI_MAP_MAX_CELL_CHARS);
        return mapImportRowsWithGemini(trimmed);
      })
    );
    for (const aiMap of wave) {
      if (!aiMap.ok) {
        return { ok: false, message: aiMap.error.message };
      }
      mergedRows.push(...aiMap.rows);
      mergedAudit.push(...aiMap.audit);
    }
  }
  return { ok: true, rows: mergedRows, audit: mergedAudit };
}

function parseJson(text: string): ParseResult {
  try {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { jobs?: unknown }).jobs)
        ? (parsed as { jobs: unknown[] }).jobs
        : null;
    if (!list) {
      return { rows: [], errors: ["JSON must be an array or an object with a jobs array."] };
    }
    const rows: UploadJobInput[] = [];
    const errors: string[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== "object") {
        errors.push(`Row ${i + 1}: invalid object.`);
        continue;
      }
      const o = item as Record<string, unknown>;
      const company = typeof o.company === "string" ? o.company : "";
      const role = typeof o.role === "string" ? o.role : "";
      const link = typeof o.link === "string" ? o.link : "";
      if (!company || !role || !link) {
        errors.push(`Row ${i + 1}: missing company/role/link.`);
        continue;
      }
      rows.push({
        company,
        role,
        link,
        source: typeof o.source === "string" ? o.source : "Upload",
        description: typeof o.description === "string" ? o.description : null,
        location: typeof o.location === "string" ? o.location : null,
        remotePolicy: typeof o.remotePolicy === "string" ? o.remotePolicy : null,
        ctc: typeof o.ctc === "string" ? o.ctc : null,
        dateDiscovered: typeof o.dateDiscovered === "string" ? o.dateDiscovered : null,
      });
    }
    return { rows, errors };
  } catch {
    return { rows: [], errors: ["Could not parse JSON file."] };
  }
}

export function JobsImportUpload({
  onImported,
}: {
  onImported?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<UploadJobInput[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [mappingAudit, setMappingAudit] = useState<ImportMappingAudit[]>([]);
  const [minRelevance, setMinRelevance] = useState("60");

  const canImport = rows.length > 0 && !busy;
  const sample = useMemo(() => rows.slice(0, 3), [rows]);

  async function onPick(file: File) {
    setBusy(true);
    try {
      const text = await readAsText(file);
      const isJson = file.name.toLowerCase().endsWith(".json");
      const structured = isJson
        ? parseJson(text)
        : (() => {
            const generic = parseCsvToGenericRows(text);
            const direct = parseCsv(text);
            if (direct.rows.length > 0) return direct;
            const fallback = mapByKnownKeys(generic.rows);
            return { rows: fallback, errors: generic.errors };
          })();

      let finalRows = structured.rows;
      const finalErrors = [...structured.errors];
      let audit: ImportMappingAudit[] = [];

      if (finalRows.length === 0) {
        const genericRows: GenericRow[] = isJson
          ? (() => {
              try {
                const parsed = JSON.parse(text) as unknown;
                if (Array.isArray(parsed)) {
                  return parsed.filter(
                    (x): x is GenericRow => Boolean(x) && typeof x === "object"
                  );
                }
                if (
                  parsed &&
                  typeof parsed === "object" &&
                  Array.isArray((parsed as { jobs?: unknown }).jobs)
                ) {
                  return (parsed as { jobs: unknown[] }).jobs.filter(
                    (x): x is GenericRow => Boolean(x) && typeof x === "object"
                  );
                }
                return [];
              } catch {
                return [];
              }
            })()
          : parseCsvToGenericRows(text).rows;

        if (genericRows.length > 0) {
          const aiMap = await mapImportRowsWithGeminiInChunks(genericRows);
          if (aiMap.ok) {
            finalRows = aiMap.rows;
            audit = aiMap.audit;
            if (aiMap.rows.length > 0) {
              toast.message("Used AI schema mapping to normalize this file.");
            }
          } else {
            finalErrors.push(aiMap.message);
          }
        }
      }

      setRows(finalRows);
      setErrors(finalErrors);
      setMappingAudit(audit);
      if (finalRows.length > 0) {
        toast.success(`Parsed ${finalRows.length} jobs from ${file.name}.`);
      } else {
        toast.error("No valid jobs found in this file.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read upload.");
      setRows([]);
      setErrors(["Could not read file."]);
      setMappingAudit([]);
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setBusy(true);
    try {
      const threshold = Number.parseInt(minRelevance, 10);
      const minRel = Number.isNaN(threshold) ? 60 : threshold;
      const chunks: UploadJobInput[][] = [];
      for (let i = 0; i < rows.length; i += IMPORT_JOBS_CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + IMPORT_JOBS_CHUNK_SIZE));
      }
      let addedCount = 0;
      let aiConsidered = 0;
      let aiMatched = 0;
      let skippedInvalid = 0;
      const importBatches = Math.ceil(chunks.length / MAP_IMPORT_CONCURRENCY);
      for (let batchStart = 0; batchStart < chunks.length; batchStart += MAP_IMPORT_CONCURRENCY) {
        const batchEnd = Math.min(batchStart + MAP_IMPORT_CONCURRENCY, chunks.length);
        const waveNum = Math.floor(batchStart / MAP_IMPORT_CONCURRENCY) + 1;
        if (chunks.length > 1) {
          toast.message(
            `Importing wave ${waveNum} of ${importBatches} (chunks ${batchStart + 1}–${batchEnd} of ${chunks.length}, up to ${MAP_IMPORT_CONCURRENCY} in parallel)…`
          );
        }
        const results = await Promise.all(
          chunks.slice(batchStart, batchEnd).map((chunk) =>
            importUploadJobs({
              jobs: truncateJobsForImportPayload(chunk),
              minRelevance: minRel,
            })
          )
        );
        for (const result of results) {
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          addedCount += result.addedCount;
          aiConsidered += result.aiConsidered;
          aiMatched += result.aiMatched;
          skippedInvalid += result.skippedInvalid;
        }
      }
      toast.success(
        `Imported ${addedCount} jobs. AI matched ${aiMatched}/${aiConsidered}.`
      );
      if (skippedInvalid > 0) {
        toast.message(`${skippedInvalid} rows were skipped as invalid.`);
      }
      setRows([]);
      setErrors([]);
      setMappingAudit([]);
      if (onImported) {
        await onImported();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h3 className="section-heading">Import jobs (CSV or JSON)</h3>
      <p className="section-desc mt-1">
        Upload a file, then we filter by your saved preferences and AI relevance before adding to your board.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          className={cn(
            "btn-secondary w-full cursor-pointer sm:w-auto",
            busy && "cursor-not-allowed opacity-60"
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          Choose CSV / JSON
          <input
            type="file"
            accept=".csv,application/json,.json,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) void onPick(file);
            }}
          />
        </label>
        <label className="label">
          Min AI relevance (0-100)
          <input
            value={minRelevance}
            onChange={(e) => setMinRelevance(e.target.value)}
            inputMode="numeric"
            className="input ml-2 inline-block w-20"
          />
        </label>
        <button
          type="button"
          disabled={!canImport}
          onClick={() => void onImport()}
          className="btn-primary w-full sm:w-auto"
        >
          {busy ? "Processing..." : `Import ${rows.length || ""}`.trim()}
        </button>
      </div>

      {sample.length > 0 && (
        <div className="card-inset mt-4 p-3 text-xs text-foreground-secondary">
          <p className="font-medium text-foreground">Preview</p>
          <ul className="mt-2 space-y-1">
            {sample.map((r) => (
              <li key={`${r.company}-${r.role}-${r.link}`}>{r.role} at {r.company}</li>
            ))}
          </ul>
        </div>
      )}

      {mappingAudit.length > 0 && (
        <div className="callout-info mt-4">
          <p className="font-medium">AI mapping report</p>
          <ul className="mt-2 space-y-1">
            {mappingAudit.slice(0, 10).map((a, i) => (
              <li key={`${a.field}-${i}`}>
                <span className="font-medium">{a.field}</span>:{" "}
                <span className="font-mono">{a.mappedFrom}</span> (
                {a.confidence}%)
                {a.note ? ` - ${a.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <div className="callout-warn mt-4 text-xs">
          {errors.slice(0, 4).map((e) => (
            <p key={e}>{e}</p>
          ))}
          {errors.length > 4 && <p>...and {errors.length - 4} more</p>}
        </div>
      )}
    </section>
  );
}
