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
          const aiMap = await mapImportRowsWithGemini(genericRows);
          if (aiMap.ok) {
            finalRows = aiMap.rows;
            audit = aiMap.audit;
            if (aiMap.rows.length > 0) {
              toast.message("Used AI schema mapping to normalize this file.");
            }
          } else {
            finalErrors.push(aiMap.error.message);
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
      const result = await importUploadJobs({
        jobs: rows,
        minRelevance: Number.isNaN(threshold) ? 60 : threshold,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Imported ${result.addedCount} jobs. AI matched ${result.aiMatched}/${result.aiConsidered}.`
      );
      if (result.skippedInvalid > 0) {
        toast.message(`${result.skippedInvalid} rows were skipped as invalid.`);
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
    <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
      <h3 className="text-lg font-semibold text-slate-900">Import jobs (CSV or JSON)</h3>
      <p className="mt-1 text-sm text-slate-600">
        Upload a file, then we filter by your saved preferences and AI relevance before adding to your board.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          className={cn(
            "inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 sm:w-auto",
            "hover:bg-white/70",
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
        <label className="text-xs font-medium text-slate-600">
          Min AI relevance (0-100)
          <input
            value={minRelevance}
            onChange={(e) => setMinRelevance(e.target.value)}
            inputMode="numeric"
            className="ml-2 w-20 rounded-xl border border-white/60 bg-white/50 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <button
          type="button"
          disabled={!canImport}
          onClick={() => void onImport()}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-sky-400/50 bg-sky-500/90 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:bg-sky-600 disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Processing..." : `Import ${rows.length || ""}`.trim()}
        </button>
      </div>

      {sample.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/50 bg-white/35 p-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">Preview</p>
          <ul className="mt-2 space-y-1">
            {sample.map((r) => (
              <li key={`${r.company}-${r.role}-${r.link}`}>{r.role} at {r.company}</li>
            ))}
          </ul>
        </div>
      )}

      {mappingAudit.length > 0 && (
        <div className="mt-4 rounded-2xl border border-blue-200/80 bg-blue-50/80 p-3 text-xs text-blue-900">
          <p className="font-semibold">AI mapping report</p>
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
        <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/90 p-3 text-xs text-amber-900">
          {errors.slice(0, 4).map((e) => (
            <p key={e}>{e}</p>
          ))}
          {errors.length > 4 && <p>...and {errors.length - 4} more</p>}
        </div>
      )}
    </section>
  );
}
