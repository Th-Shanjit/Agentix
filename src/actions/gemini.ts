"use server";

import { auth } from "@/auth";
import {
  geminiError,
  getGeminiModel,
  mapGeminiException,
  type GeminiError,
  type GeminiErrorCode,
} from "@/lib/gemini-internal";

export type { GeminiError, GeminiErrorCode };

function getModel() {
  return getGeminiModel();
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

export type EstimateCTCResult =
  | {
      ok: true;
      text: string;
      range: {
        low: number;
        mid: number;
        high: number;
        currency: string;
        period: "YEARLY" | "MONTHLY";
        format: "LPA" | "K" | "RAW";
      } | null;
    }
  | { ok: false; error: GeminiError };

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
    const model = getModel();
    const prompt = inrOnly
      ? `Estimate TOTAL ANNUAL compensation in INDIA for role "${role}" at company "${company}".
Location/context: "${(location ?? "").trim() || "unknown"}"

STRICT RULES (INR-only regeneration):
- Output MUST use Indian market norms only. Currency MUST be exactly "INR" in JSON.
- low, mid, high MUST be total annual compensation in Indian Rupees (full integer amounts). Example: 11–17 LPA means low=1100000, high=1700000, mid around midpoint.
- period MUST be "YEARLY". format MUST be "LPA".
- In "summary", use INR and Indian wording only (LPA, lakhs, crores). NEVER prefix with $, €, or hybrid forms like "$1.1L" or "USD" with L/lakh.
- Be concise (under 180 words). Explain basis (city tier, level, comps). Include a short "sources considered" note (categories only, no links).

Return ONLY one JSON object:
{
  "summary": "string",
  "range": {
    "low": number,
    "mid": number,
    "high": number,
    "currency": "INR",
    "period": "YEARLY",
    "format": "LPA"
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

Return ONLY one JSON object:
{
  "summary": "brief CTC explainer text with basis and source categories",
  "range": {
    "low": number,
    "mid": number,
    "high": number,
    "currency": "INR|USD|EUR|GBP|SGD|AED|...",
    "period": "YEARLY|MONTHLY",
    "format": "LPA|K|RAW"
  }
}`;

    const result = await model.generateContent(prompt);
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
    const low =
      rangeRaw && typeof rangeRaw === "object"
        ? parseRangeNumber((rangeRaw as { low?: unknown }).low)
        : null;
    const high =
      rangeRaw && typeof rangeRaw === "object"
        ? parseRangeNumber((rangeRaw as { high?: unknown }).high)
        : null;
    const mid =
      rangeRaw && typeof rangeRaw === "object"
        ? parseRangeNumber((rangeRaw as { mid?: unknown }).mid)
        : null;
    let range: Extract<EstimateCTCResult, { ok: true }>["range"] = null;
    if (rangeRaw && typeof rangeRaw === "object" && low != null && high != null) {
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
      if (inrOnly) {
        range = {
          low: lo,
          mid: mi,
          high: hi,
          currency: "INR",
          period: "YEARLY",
          format: "LPA",
        };
      } else if (typeof (rangeRaw as { currency?: unknown }).currency === "string") {
        range = {
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
        };
      }
    }
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
    const model = getModel();
    const prompt = `You are an ATS screening engine.

Compare the resume text below to the job: "${role}" at "${company}".
Job description/context:
"""
${(jobDescription ?? "").trim() || "Not provided"}
"""

Return ONLY a single JSON object (no markdown fences) with exactly these keys:
- "matchPercentage": number from 0 to 100 (integer)
- "verdict": short string (1-2 sentences)
- "missingKeywords": array of strings (skills or phrases the resume is weak on for this role)
- "strengths": array of strings (clear strengths vs the role)

Resume text:
"""
${snippet}
"""`;

    const result = await model.generateContent(prompt);
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
