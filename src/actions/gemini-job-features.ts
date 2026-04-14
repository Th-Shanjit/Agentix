"use server";

import { auth } from "@/auth";
import {
  geminiError,
  getGeminiModel,
  mapGeminiException,
  type GeminiError,
} from "@/lib/gemini-internal";

const MAX_RESUME = 28_000;
const MAX_DESC = 8_000;

export type SearchMatchRow = {
  jobId: string;
  fitScore: number;
  upsideScore: number;
  relevanceScore: number;
  strengths: string[];
  weaknesses: string[];
};

export type SearchMatchBatchResult =
  | { ok: true; matches: SearchMatchRow[] }
  | { ok: false; error: GeminiError };

export type ImportMappedJob = {
  company: string;
  role: string;
  link: string;
  source?: string | null;
  description?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
  ctc?: string | null;
  dateDiscovered?: string | null;
};

export type ImportMappingAudit = {
  field: string;
  mappedFrom: string;
  confidence: number;
  note?: string | null;
};

export async function rankRoleSimilarity(
  intendedRole: string,
  candidateRoles: string[]
): Promise<
  | { ok: true; related: string[] }
  | { ok: false; error: GeminiError }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }
  if (!intendedRole.trim() || candidateRoles.length === 0) {
    return { ok: true, related: [] };
  }
  const prompt = `You are matching equivalent/nearby job titles.
Intended role: "${intendedRole.trim()}"
Candidate roles: ${JSON.stringify(candidateRoles)}

Return ONLY a JSON array of candidate role strings that are close enough to consider relevant.
Include junior/senior/intern/associate variations if they are in same domain.
No markdown, no explanation.`;
  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const arr = extractJsonArray(raw);
    if (!arr) {
      return { ok: true, related: [] };
    }
    const set = new Set(candidateRoles);
    const related = arr
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter((x) => set.has(x));
    return { ok: true, related };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "Role similarity matching failed."),
    };
  }
}

function clamp(n: unknown, lo: number, hi: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function extractJsonArray(raw: string): unknown[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Batch match resume to several listings for search ranking (one model call). */
export async function batchSearchMatch(
  resumeText: string,
  jobs: {
    id: string;
    title: string;
    company: string;
    description?: string | null;
  }[]
): Promise<SearchMatchBatchResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }

  const text = resumeText.trim();
  if (!text) {
    return {
      ok: false,
      error: geminiError("validation", "Upload a résumé on Profile first.", false),
    };
  }

  if (jobs.length === 0) {
    return { ok: true, matches: [] };
  }

  const resume =
    text.length > MAX_RESUME
      ? text.slice(0, MAX_RESUME) + "\n[truncated…]"
      : text;

  const lines = jobs.map((j) => {
    const d = j.description?.trim();
    const snippet =
      d && d.length > 400 ? d.slice(0, 400) + "…" : d ?? "";
    return `- id:${j.id} | ${j.title} at ${j.company}${snippet ? ` | ${snippet}` : ""}`;
  });

  const prompt = `You compare a candidate résumé to several job postings.

Résumé:
"""
${resume}
"""

Jobs (use exact id strings in output):
${lines.join("\n")}

Return ONLY a JSON array (no markdown). Each element must have:
- "jobId": string (exact id from input)
- "fitScore": number 0-100 (how well the résumé fits the role today)
- "upsideScore": number 0-100 (potential to raise fit with reasonable changes)
- "relevanceScore": number 0-100 (blend of fit + upside for ranking)
- "strengths": string[] (2-4 short bullets)
- "weaknesses": string[] (2-4 short gaps vs the role)

If uncertain, still output best-effort numbers.`;

  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const arr = extractJsonArray(raw);
    if (!arr) {
      return {
        ok: false,
        error: geminiError(
          "parse_error",
          "Could not parse match scores. Try again.",
          true
        ),
      };
    }

    const matches: SearchMatchRow[] = [];
    const want = new Set(jobs.map((j) => j.id));
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const jobId = typeof o.jobId === "string" ? o.jobId : "";
      if (!want.has(jobId)) continue;
      const strengths = Array.isArray(o.strengths)
        ? o.strengths.filter((x): x is string => typeof x === "string").slice(0, 6)
        : [];
      const weaknesses = Array.isArray(o.weaknesses)
        ? o.weaknesses.filter((x): x is string => typeof x === "string").slice(0, 6)
        : [];
      matches.push({
        jobId,
        fitScore: clamp(o.fitScore, 0, 100),
        upsideScore: clamp(o.upsideScore, 0, 100),
        relevanceScore: clamp(o.relevanceScore, 0, 100),
        strengths,
        weaknesses,
      });
    }

    return { ok: true, matches };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "Match scoring failed."),
    };
  }
}

export async function mapImportRowsWithGemini(
  rows: Record<string, unknown>[]
): Promise<
  | { ok: true; rows: ImportMappedJob[]; audit: ImportMappingAudit[] }
  | { ok: false; error: GeminiError }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }
  if (!rows.length) return { ok: true, rows: [], audit: [] };

  const sample = rows.slice(0, 80);
  const prompt = `You normalize uploaded job records from mixed schemas.
Input is a JSON array of row objects. Keys may vary (for example: companyName, employer, title, job_title, applyUrl, posting_link, etc.).

Return ONLY one JSON object:
{
  "rows": [ ...normalized rows... ],
  "audit": [
    { "field": "company|role|link|source|description|location|remotePolicy|ctc|dateDiscovered",
      "mappedFrom": "best source key or expression",
      "confidence": 0-100,
      "note": "optional brief note" }
  ]
}

Each object in "rows" must use this exact schema:
{ "company": string, "role": string, "link": string, "source": string | null, "description": string | null, "location": string | null, "remotePolicy": string | null, "ctc": string | null, "dateDiscovered": string | null }

Rules:
- Map semantically equivalent fields to the schema keys.
- Keep only rows that clearly have company, role, and link.
- link must look like a web URL.
- If missing optional fields, set null.
- Do not include commentary or markdown.

Rows:
${JSON.stringify(sample)}`;

  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const obj = extractJsonObject(raw);
    if (!obj || !Array.isArray(obj.rows)) {
      return {
        ok: false,
        error: geminiError(
          "parse_error",
          "Could not map uploaded file structure. Try a cleaner file.",
          true
        ),
      };
    }
    const mapped: ImportMappedJob[] = [];
    for (const item of obj.rows) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const company = typeof o.company === "string" ? o.company.trim() : "";
      const role = typeof o.role === "string" ? o.role.trim() : "";
      const link = typeof o.link === "string" ? o.link.trim() : "";
      if (!company || !role || !link || !URL.canParse(link)) continue;
      mapped.push({
        company,
        role,
        link,
        source: typeof o.source === "string" ? o.source : null,
        description: typeof o.description === "string" ? o.description : null,
        location: typeof o.location === "string" ? o.location : null,
        remotePolicy: typeof o.remotePolicy === "string" ? o.remotePolicy : null,
        ctc: typeof o.ctc === "string" ? o.ctc : null,
        dateDiscovered:
          typeof o.dateDiscovered === "string" ? o.dateDiscovered : null,
      });
    }
    const audit: ImportMappingAudit[] = Array.isArray(obj.audit)
      ? obj.audit
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
          .map((x) => ({
            field: typeof x.field === "string" ? x.field : "unknown",
            mappedFrom: typeof x.mappedFrom === "string" ? x.mappedFrom : "unknown",
            confidence: clamp(x.confidence, 0, 100),
            note: typeof x.note === "string" ? x.note : null,
          }))
      : [];

    return { ok: true, rows: mapped, audit };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "AI mapping failed."),
    };
  }
}

export type JobEnrichmentPayload = {
  ctcBands: {
    low: number;
    mid: number;
    high: number;
    currency: string;
    credibilityNote: string;
  };
  ratingsWeb: {
    glassdoorSummary: string;
    ambitionBoxSummary: string;
    disclaimer: string;
  };
  forumSentiment: {
    summary: string;
    label: string;
    disclaimer: string;
  };
  resumeGrade: number;
  resumeStrengths: string[];
  resumeWeaknesses: string[];
  areasToFix: string[];
};

export type JobEnrichmentGeminiResult =
  | { ok: true; data: JobEnrichmentPayload }
  | { ok: false; error: GeminiError };

export async function enrichJobDetailGemini(
  resumeText: string,
  job: {
    title: string;
    company: string;
    location?: string | null;
    description?: string | null;
    ctc?: string | null;
  }
): Promise<JobEnrichmentGeminiResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }

  const resume = resumeText.trim()
    ? resumeText.trim().length > MAX_RESUME
      ? resumeText.trim().slice(0, MAX_RESUME) + "\n[truncated…]"
      : resumeText.trim()
    : "";

  const desc = job.description?.trim();
  const jd =
    desc && desc.length > MAX_DESC
      ? desc.slice(0, MAX_DESC) + "…"
      : desc ?? "";

  const prompt = `You help a job seeker. Use general knowledge and careful language — do NOT claim you scraped Glassdoor or any site. Summaries are illustrative only.

Job: ${job.title} at ${job.company}
Location: ${job.location ?? "unknown"}
Listed compensation hint: ${job.ctc ?? "not provided"}
Description excerpt:
"""
${jd}
"""

Candidate résumé (may be empty):
"""
${resume || "(none — still give CTC band estimate and skip deep resume grade)"}
"""

Return ONLY one JSON object (no markdown) with keys:
- "ctcBands": { "low": number, "mid": number, "high": number, "currency": string (e.g. USD or INR), "credibilityNote": string (1-2 sentences on uncertainty) }
- "ratingsWeb": { "glassdoorSummary": string (public perception style, not a real score unless you clearly say estimate), "ambitionBoxSummary": string, "disclaimer": string (must say estimates / not verified) }
- "forumSentiment": { "summary": string (1-3 sentences), "label": string (e.g. Mixed), "disclaimer": string }
- "resumeGrade": number 0-100 (0 if no résumé)
- "resumeStrengths": string[]
- "resumeWeaknesses": string[]
- "areasToFix": string[] (actionable bullets)`;

  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const o = extractJsonObject(raw);
    if (!o || !o.ctcBands || !o.ratingsWeb || !o.forumSentiment) {
      return {
        ok: false,
        error: geminiError(
          "parse_error",
          "Could not parse enrichment. Try again.",
          true
        ),
      };
    }

    const bands = o.ctcBands as Record<string, unknown>;
    const rw = o.ratingsWeb as Record<string, unknown>;
    const fs = o.forumSentiment as Record<string, unknown>;

    const sal = (x: unknown) =>
      typeof x === "number" && Number.isFinite(x) ? Math.max(0, x) : 0;

    const data: JobEnrichmentPayload = {
      ctcBands: {
        low: sal(bands.low),
        mid: sal(bands.mid),
        high: sal(bands.high),
        currency: typeof bands.currency === "string" ? bands.currency : "USD",
        credibilityNote:
          typeof bands.credibilityNote === "string"
            ? bands.credibilityNote
            : "Estimate only.",
      },
      ratingsWeb: {
        glassdoorSummary:
          typeof rw.glassdoorSummary === "string" ? rw.glassdoorSummary : "",
        ambitionBoxSummary:
          typeof rw.ambitionBoxSummary === "string" ? rw.ambitionBoxSummary : "",
        disclaimer:
          typeof rw.disclaimer === "string"
            ? rw.disclaimer
            : "Not verified; illustrative only.",
      },
      forumSentiment: {
        summary: typeof fs.summary === "string" ? fs.summary : "",
        label: typeof fs.label === "string" ? fs.label : "Unknown",
        disclaimer:
          typeof fs.disclaimer === "string"
            ? fs.disclaimer
            : "Not verified.",
      },
      resumeGrade: clamp(o.resumeGrade, 0, 100),
      resumeStrengths: Array.isArray(o.resumeStrengths)
        ? o.resumeStrengths.filter((x): x is string => typeof x === "string")
        : [],
      resumeWeaknesses: Array.isArray(o.resumeWeaknesses)
        ? o.resumeWeaknesses.filter((x): x is string => typeof x === "string")
        : [],
      areasToFix: Array.isArray(o.areasToFix)
        ? o.areasToFix.filter((x): x is string => typeof x === "string")
        : [],
    };

    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "Enrichment failed."),
    };
  }
}

export type FiveTonesResult =
  | {
      ok: true;
      variants: { tone: string; text: string }[];
    }
  | { ok: false; error: GeminiError };

export async function fiveResumeToneVariants(
  resumeText: string,
  job: { title: string; company: string; description?: string | null }
): Promise<FiveTonesResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }

  const text = resumeText.trim();
  if (!text) {
    return {
      ok: false,
      error: geminiError("validation", "Résumé text is empty.", false),
    };
  }

  const resume =
    text.length > MAX_RESUME ? text.slice(0, MAX_RESUME) + "\n[truncated…]" : text;
  const jd = (job.description ?? "").slice(0, MAX_DESC);

  const prompt = `Rewrite the résumé as plain text for ATS systems, tailored to:
Job: ${job.title} at ${job.company}
Description excerpt:
"""
${jd}
"""

Source résumé:
"""
${resume}
"""

Return ONLY JSON array with exactly 5 objects, each:
{ "tone": string, "text": string }

Tones must be: "Neutral", "Confident", "Concise", "Narrative", "Executive"
Each "text" is full résumé body plain text, ready to paste.`;

  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const arr = extractJsonArray(raw);
    if (!arr || arr.length < 1) {
      return {
        ok: false,
        error: geminiError(
          "parse_error",
          "Could not parse résumé variants. Try again.",
          true
        ),
      };
    }

    const variants: { tone: string; text: string }[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.tone !== "string" || typeof o.text !== "string") continue;
      variants.push({ tone: o.tone, text: o.text });
      if (variants.length >= 5) break;
    }

    if (variants.length === 0) {
      return {
        ok: false,
        error: geminiError("parse_error", "No variants returned.", true),
      };
    }

    return { ok: true, variants };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "Résumé variants failed."),
    };
  }
}
