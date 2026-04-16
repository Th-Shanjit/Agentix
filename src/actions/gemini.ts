"use server";

import { auth } from "@/auth";
import {
  geminiError,
  getGeminiModel,
  mapGeminiException,
  parseCtcConfidence,
  type CtcConfidenceLevel,
  type GeminiError,
  type GeminiErrorCode,
} from "@/lib/gemini-internal";

export type { GeminiError, GeminiErrorCode, CtcConfidenceLevel };

function geminiJsonRequest(prompt: string) {
  return {
    contents: [{ role: "user" as const, parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" as const },
  };
}

function parseRangeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value !== "string") return null;
  const raw = value.trim().toUpperCase().replace(/,/g, "");
  if (!raw) return null;
  const m = raw.match(/^(\d+(?:\.\d+)?)([KLM])?$/);
  if (!m) return null;
  const num = Number.parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  const unit = m[2] ?? "";
  const mult = unit === "K" ? 1_000 : unit === "L" ? 100_000 : unit === "M" ? 1_000_000 : 1;
  return Math.max(0, Math.round(num * mult));
}

export type AtsMatchResult = {
  matchPercentage: number;
  verdict: string;
  missingKeywords: string[];
  strengths: string[];
};

export type CtcRangeEstimate = {
  low: number;
  mid: number;
  high: number;
  currency: string;
  period: "YEARLY" | "MONTHLY";
  format: "LPA" | "K" | "RAW";
  confidence: CtcConfidenceLevel;
};

export type EstimateCTCResult =
  | {
      ok: true;
      text: string;
      range: CtcRangeEstimate | null;
    }
  | { ok: false; error: GeminiError };

export type BatchEstimateCTCInput = {
  id: string;
  jobRole: string;
  company: string;
  location?: string;
};

export type BatchEstimateCTCRow = {
  id: string;
  summary: string;
  range: CtcRangeEstimate | null;
};

export type BatchEstimateCTCResult =
  | { ok: true; rows: BatchEstimateCTCRow[] }
  | { ok: false; error: GeminiError };

const BATCH_ESTIMATE_CTC_ROLES = 20;
const BATCH_ESTIMATE_CTC_CONCURRENCY = 2;

export type MatchResumeATSResult =
  | { ok: true; data: AtsMatchResult }
  | { ok: false; error: GeminiError };

/** If model returns annual band as lakhs (e.g. 11–17) instead of rupees, scale to INR. */
function normalizeInrAnnualRupees(low: number, high: number): { low: number; high: number } {
  const lo = Math.max(0, Math.round(low));
  const hi = Math.max(0, Math.round(high));
  if (hi === 0) return { low: lo, high: hi };
  // Typical LPA bands are 1–50; values in this range are almost certainly "lakhs" not rupees.
  if (hi < 100_000 && hi <= 50 && lo <= 50) {
    return { low: lo * 100_000, high: hi * 100_000 };
  }
  return { low: lo, high: hi };
}

function coerceCtcRangeFromRaw(
  rangeRaw: unknown,
  inrOnly: boolean
): CtcRangeEstimate | null {
  if (!rangeRaw || typeof rangeRaw !== "object") return null;
  const low = parseRangeNumber((rangeRaw as { low?: unknown }).low);
  const high = parseRangeNumber((rangeRaw as { high?: unknown }).high);
  const mid = parseRangeNumber((rangeRaw as { mid?: unknown }).mid);
  if (low == null || high == null) return null;
  let lo = low;
  let hi = high;
  let mi = mid ?? Math.round((low + high) / 2);
  if (inrOnly) {
    const n = normalizeInrAnnualRupees(lo, hi);
    lo = n.low;
    hi = n.high;
    mi =
      mid != null
        ? normalizeInrAnnualRupees(mid, mid).low
        : Math.round((lo + hi) / 2);
  }
  const conf = parseCtcConfidence((rangeRaw as { confidence?: unknown }).confidence);

  if (inrOnly) {
    return {
      low: lo,
      mid: mi,
      high: hi,
      currency: "INR",
      period: "YEARLY",
      format: "LPA",
      confidence: conf,
    };
  }
  if (typeof (rangeRaw as { currency?: unknown }).currency !== "string") {
    return null;
  }
  return {
    low: lo,
    mid: mi,
    high: hi,
    currency: (rangeRaw as { currency: string }).currency,
    period:
      (rangeRaw as { period?: unknown }).period === "MONTHLY"
        ? "MONTHLY"
        : "YEARLY",
    format:
      (rangeRaw as { format?: unknown }).format === "LPA" ||
      (rangeRaw as { format?: unknown }).format === "K"
        ? ((rangeRaw as { format: "LPA" | "K" }).format ?? "RAW")
        : "RAW",
    confidence: conf,
  };
}

export type EstimateCTCOptions = {
  /** Force Indian market, INR only, annual LPA; summary must not mix $ with L/lakh. */
  inrOnly?: boolean;
};

/** Estimate CTC for a role at a company (concise). */
export async function estimateCTC(
  jobRole: string,
  company: string,
  location?: string | null,
  options?: EstimateCTCOptions
): Promise<EstimateCTCResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }

  const role = jobRole.trim();
  const co = company.trim();
  if (!role || !co) {
    return {
      ok: false,
      error: geminiError(
        "validation",
        "Role and company are required.",
        false
      ),
    };
  }

  const inrOnly = options?.inrOnly === true;

  try {
    const model = getGeminiModel(true);
    const prompt = inrOnly
      ? `Estimate TOTAL ANNUAL compensation in INDIA for role "${role}" at company "${company}".
Location/context: "${(location ?? "").trim() || "unknown"}"

STRICT RULES (INR-only):
- Use Indian market norms only. Currency MUST be exactly "INR" in the range object.
- low, mid, high MUST be total annual compensation in Indian Rupees (full integer amounts). Example: 11–17 LPA means low=1100000, high=1700000, mid near the midpoint.
- period MUST be "YEARLY". format MUST be "LPA".
- In "range", include "confidence": "LOW" | "MID" | "HIGH" reflecting how reliable this estimate is (strong verified data vs sparse guess):
  - "HIGH" if you have strong verified data for this exact company and role.
  - "MID" if the band is based mainly on industry or peer averages for the role/location.
  - "LOW" if you are guessing from sparse or weak data.
- In "summary", use INR and Indian wording only (LPA, lakhs, crores). NEVER prefix with $, €, or hybrid forms like "$1.1L" or "USD" with L/lakh.
- Be concise (under 180 words). Explain basis (city tier, level, comps). Include a short "sources considered" note (categories only, no links).

Shape:
{
  "summary": "string",
  "range": {
    "low": number,
    "mid": number,
    "high": number,
    "currency": "INR",
    "period": "YEARLY",
    "format": "LPA",
    "confidence": "LOW" | "MID" | "HIGH"
  }
}`
      : `Estimate compensation for role "${role}" at company "${company}".
Known location/context: "${(location ?? "").trim() || "unknown"}"

Rules:
- Be concise (under 180 words) and explanatory.
- Choose currency relevant to likely job geography:
  - Use INR for India-focused roles.
  - Use local currency for clearly non-India roles (USD, EUR, GBP, SGD, AED, etc.).
- Choose period based on market convention for that role/location:
  - "YEARLY" when annual pay is standard.
  - "MONTHLY" when monthly salary is more natural.
- Give a reasonable band/range.
- If public data is unclear, say so and give a qualitative estimate.
- Explain the estimate basis (market comps, level, city band, company tier, role family).
- Include a short "sources considered" note using general source categories (job boards, compensation communities, public salary discussions). No fabricated links.
- In "range", include "confidence": "LOW" | "MID" | "HIGH" (how reliable this estimate is — not the spread of the numbers):
  - "HIGH" if strong verified data for this exact company/role.
  - "MID" if based mainly on industry averages.
  - "LOW" if guessing from sparse data.

Shape:
{
  "summary": "brief CTC explainer text with basis and source categories",
  "range": {
    "low": number,
    "mid": number,
    "high": number,
    "currency": "INR|USD|EUR|GBP|SGD|AED|...",
    "period": "YEARLY|MONTHLY",
    "format": "LPA|K|RAW",
    "confidence": "LOW" | "MID" | "HIGH"
  }
}`;

    const result = await model.generateContent(geminiJsonRequest(prompt));
    const raw = result.response.text().trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed =
      start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null;
    const text =
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { summary?: unknown }).summary === "string"
        ? (parsed as { summary: string }).summary.trim()
        : "";
    const rangeRaw =
      parsed && typeof parsed === "object"
        ? (parsed as { range?: unknown }).range
        : null;
    const range = coerceCtcRangeFromRaw(rangeRaw, inrOnly);
    if (!text) {
      return {
        ok: false,
        error: geminiError(
          "model_empty",
          "The model returned no text. Try again.",
          true
        ),
      };
    }
    return { ok: true, text, range };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "CTC estimate failed."),
    };
  }
}

/**
 * Batch CTC: up to {@link BATCH_ESTIMATE_CTC_ROLES} roles per model call (JSON mode).
 * Multiple batches run with concurrency limited to {@link BATCH_ESTIMATE_CTC_CONCURRENCY}.
 */
export async function batchEstimateCTC(
  items: BatchEstimateCTCInput[],
  options?: EstimateCTCOptions
): Promise<BatchEstimateCTCResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }

  const byId = new Map<string, BatchEstimateCTCInput>();
  for (const it of items) {
    if (
      typeof it.id !== "string" ||
      !it.id.trim() ||
      typeof it.jobRole !== "string" ||
      !it.jobRole.trim() ||
      typeof it.company !== "string" ||
      !it.company.trim()
    ) {
      continue;
    }
    const id = it.id.trim();
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      jobRole: it.jobRole.trim(),
      company: it.company.trim(),
      location:
        typeof it.location === "string" && it.location.trim()
          ? it.location.trim()
          : undefined,
    });
  }
  const cleaned = Array.from(byId.values());
  if (cleaned.length === 0) {
    return { ok: true, rows: [] };
  }

  const inrOnly = options?.inrOnly === true;
  const batches: BatchEstimateCTCInput[][] = [];
  for (let i = 0; i < cleaned.length; i += BATCH_ESTIMATE_CTC_ROLES) {
    batches.push(cleaned.slice(i, i + BATCH_ESTIMATE_CTC_ROLES));
  }

  try {
    const model = getGeminiModel(true);

    const runBatch = async (
      batch: BatchEstimateCTCInput[]
    ): Promise<BatchEstimateCTCRow[]> => {
      const payload = batch.map((it) => ({
        id: it.id,
        jobRole: it.jobRole,
        company: it.company,
        location: it.location ?? null,
      }));

      const inrBlock = inrOnly
        ? `Each "range" must use "currency": "INR", "period": "YEARLY", "format": "LPA".
low, mid, high are total annual compensation in Indian Rupees (integer rupees). Summaries: LPA/lakhs only; no $ or foreign currency symbols.
Each "range" must include "confidence": "LOW"|"MID"|"HIGH" (estimate reliability: HIGH = strong verified data for that company/role, MID = industry averages, LOW = sparse/guess).`
        : `For each row pick currency and period appropriate to the role's likely geography.
Each "range" must include "confidence": "LOW"|"MID"|"HIGH" (HIGH = strong verified data for that company/role, MID = industry averages, LOW = sparse data).`;

      const prompt = `Estimate compensation for each role. You may use web search for current market context.
Include at most ${BATCH_ESTIMATE_CTC_ROLES} roles in this response (this batch has ${batch.length}).
${inrBlock}

Input:
${JSON.stringify(payload)}

Output a JSON array with one object per input row, same order as input. Each object:
{
  "id": string (exactly as input),
  "summary": string (brief basis and uncertainty, under ~120 words per row),
  "range": {
    "low": number,
    "mid": number,
    "high": number,
    "currency": string,
    "period": "YEARLY" | "MONTHLY",
    "format": "LPA" | "K" | "RAW",
    "confidence": "LOW" | "MID" | "HIGH"
  } | null
}
Use null for "range" only if no defensible numeric band is possible.`;

      const result = await model.generateContent(geminiJsonRequest(prompt));
      const raw = result.response.text().trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("batch_ctc_json");
      }
      if (!Array.isArray(parsed)) {
        throw new Error("batch_ctc_json");
      }

      const want = new Set(batch.map((b) => b.id));
      const got = new Map<string, BatchEstimateCTCRow>();

      for (const el of parsed) {
        if (!el || typeof el !== "object") continue;
        const o = el as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id.trim() : "";
        if (!want.has(id)) continue;
        const summary = typeof o.summary === "string" ? o.summary.trim() : "";
        const range = coerceCtcRangeFromRaw(o.range, inrOnly);
        got.set(id, { id, summary, range });
      }

      const rows: BatchEstimateCTCRow[] = [];
      for (const b of batch) {
        rows.push(
          got.get(b.id) ?? { id: b.id, summary: "", range: null }
        );
      }
      return rows;
    };

    const merged: BatchEstimateCTCRow[] = [];
    for (let waveStart = 0; waveStart < batches.length; waveStart += BATCH_ESTIMATE_CTC_CONCURRENCY) {
      const wave = batches.slice(waveStart, waveStart + BATCH_ESTIMATE_CTC_CONCURRENCY);
      const parts = await Promise.all(wave.map((b) => runBatch(b)));
      for (const p of parts) merged.push(...p);
    }

    const byResult = new Map<string, BatchEstimateCTCRow>();
    for (const row of merged) {
      byResult.set(row.id, row);
    }
    const rowsOrdered = cleaned.map(
      (it) => byResult.get(it.id) ?? { id: it.id, summary: "", range: null }
    );

    return { ok: true, rows: rowsOrdered };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "batch_ctc_json") {
      return {
        ok: false,
        error: geminiError(
          "parse_error",
          "Could not parse batch CTC response. Try again.",
          true
        ),
      };
    }
    return {
      ok: false,
      error: mapGeminiException(e, "Batch CTC estimate failed."),
    };
  }
}

function clampPct(n: unknown): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function parseAtsJson(raw: string): AtsMatchResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const matchPercentage = clampPct(o.matchPercentage);
  const verdict = typeof o.verdict === "string" ? o.verdict : "";
  const mk = Array.isArray(o.missingKeywords)
    ? o.missingKeywords.filter((x): x is string => typeof x === "string")
    : [];
  const st = Array.isArray(o.strengths)
    ? o.strengths.filter((x): x is string => typeof x === "string")
    : [];
  if (!verdict) return null;
  return {
    matchPercentage,
    verdict,
    missingKeywords: mk,
    strengths: st,
  };
}

const MAX_RESUME_CHARS = 32000;

/** ATS-style match: structured JSON from Gemini (parsed from model output). */
export async function matchResumeATS(
  resumeText: string,
  jobRole: string,
  company: string,
  jobDescription?: string
): Promise<MatchResumeATSResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }

  const text = resumeText.trim();
  const role = jobRole.trim();
  const co = company.trim();

  if (!text) {
    return {
      ok: false,
      error: geminiError(
        "validation",
        "Résumé text is empty.",
        false
      ),
    };
  }
  if (!role || !co) {
    return {
      ok: false,
      error: geminiError(
        "validation",
        "Role and company are required.",
        false
      ),
    };
  }

  const snippet =
    text.length > MAX_RESUME_CHARS
      ? text.slice(0, MAX_RESUME_CHARS) +
        "\n\n[…truncated for length; rest omitted…]"
      : text;

  try {
    const model = getGeminiModel();
    const prompt = `You are an ATS screening engine.

Compare the resume text below to the job: "${role}" at "${company}".
Job description/context:
"""
${(jobDescription ?? "").trim() || "Not provided"}
"""

Respond with an object with exactly these keys:
- "matchPercentage": number from 0 to 100 (integer)
- "verdict": short string (1-2 sentences)
- "missingKeywords": array of strings (skills or phrases the resume is weak on for this role)
- "strengths": array of strings (clear strengths vs the role)

Resume text:
"""
${snippet}
"""`;

    const result = await model.generateContent(geminiJsonRequest(prompt));
    const raw = result.response.text().trim();
    const parsed = parseAtsJson(raw);
    if (!parsed) {
      return {
        ok: false,
        error: geminiError(
          "parse_error",
          "Could not read the model response as JSON. Try again.",
          true
        ),
      };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "ATS match failed."),
    };
  }
}
