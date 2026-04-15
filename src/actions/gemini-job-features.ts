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
  archetype: string;
  letterGrade: "A" | "B" | "C" | "D" | "F";
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

export type UrlScrapeExtractedJob = {
  title: string;
  company: string;
  location: string | null;
  description: string | null;
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

const getLetterGrade = (score: number) => {
  if (score >= 90) return "A"; // Dream role, perfect match
  if (score >= 80) return "B"; // Strong match, minor gaps
  if (score >= 70) return "C"; // Stretch role or overqualified
  if (score >= 60) return "D"; // Major gaps, likely rejection
  return "F"; // Do not apply
};

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
  bragSheetText: string,
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
  const bragSheet = bragSheetText.trim()
    ? bragSheetText.trim().length > MAX_RESUME
      ? bragSheetText.trim().slice(0, MAX_RESUME) + "\n[truncated…]"
      : bragSheetText.trim()
    : "";

  const lines = jobs.map((j) => {
    const d = j.description?.trim();
    const snippet =
      d && d.length > 400 ? d.slice(0, 400) + "…" : d ?? "";
    return `- id:${j.id} | ${j.title} at ${j.company}${snippet ? ` | ${snippet}` : ""}`;
  });

  const prompt = `"You are evaluating a candidate. You are provided with a standard ATS Resume AND a 'Brag Sheet' (a raw list of proof points, metrics, and career highlights).
CRITICAL RULE: Treat the Brag Sheet as absolute truth. When writing resume variants or interview stories, prioritize injecting the hard numbers and specific project names found in the Brag Sheet over the generic text found in the standard resume."

You compare a candidate profile to several job postings.

Candidate résumé:
"""
${resume}
"""

Career highlights and proof points (hard stats, wins, outcomes):
"""
${bragSheet || "(none provided)"}
"""

Jobs (use exact id strings in output):
${lines.join("\n")}

Evaluate each job using these dimensions before scoring:
1) CV Match: How well does the resume map to the core requirements?
2) Gap Mitigation: What is missing, and can it be learned quickly?
3) Level Strategy: Is the candidate too senior or junior for this specific listing?

Return ONLY a JSON array (no markdown). Each element must have:
- "jobId": string (exact id from input)
- "archetype": string (pick one concise category, e.g. "Software Engineering", "Product", "Design", "Sales", "LLMOps")
- "fitScore": number 0-100 (how well the résumé fits the role today)
- "upsideScore": number 0-100 (potential to raise fit with reasonable changes)
- "relevanceScore": number 0-100 (final decision score combining CV Match, Gap Mitigation, and Level Strategy)
- "strengths": string[] (2-4 short bullets)
- "weaknesses": string[] (2-4 short gaps vs the role)

Use the career highlights as high-signal evidence when present.
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
      const archetype =
        typeof o.archetype === "string" && o.archetype.trim()
          ? o.archetype.trim().slice(0, 80)
          : "General";
      const strengths = Array.isArray(o.strengths)
        ? o.strengths.filter((x): x is string => typeof x === "string").slice(0, 6)
        : [];
      const weaknesses = Array.isArray(o.weaknesses)
        ? o.weaknesses.filter((x): x is string => typeof x === "string").slice(0, 6)
        : [];
      const relevanceScore = clamp(o.relevanceScore, 0, 100);
      matches.push({
        jobId,
        archetype,
        letterGrade: getLetterGrade(relevanceScore),
        fitScore: clamp(o.fitScore, 0, 100),
        upsideScore: clamp(o.upsideScore, 0, 100),
        relevanceScore,
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

export async function extractJobFromScrapeWithGemini(input: {
  url: string;
  titleTag: string;
  metaDescription: string;
  metaOgTitle: string;
  bodyText: string;
}): Promise<
  | { ok: true; job: UrlScrapeExtractedJob }
  | { ok: false; error: GeminiError }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }

  const prompt = `Extract structured job fields from scraped page text.
URL: ${input.url}
HTML <title>: ${input.titleTag || "(none)"}
meta description: ${input.metaDescription || "(none)"}
meta og:title: ${input.metaOgTitle || "(none)"}
body excerpt:
"""
${input.bodyText.slice(0, 12000)}
"""

Return ONLY one JSON object with this exact shape:
{ "title": string, "company": string, "location": string | null, "description": string | null }

Rules:
- title: job role title only, not company name or marketing text.
- company: employer/company name.
- location: short location string or null.
- description: concise plain-text summary of role requirements and responsibilities.
- If uncertain, return best effort with non-empty title/company when possible.
- No markdown, no commentary.`;

  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const obj = extractJsonObject(raw);
    if (!obj) {
      return {
        ok: false,
        error: geminiError(
          "parse_error",
          "Could not parse extracted job fields.",
          true
        ),
      };
    }
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const company = typeof obj.company === "string" ? obj.company.trim() : "";
    const location =
      typeof obj.location === "string" && obj.location.trim()
        ? obj.location.trim()
        : null;
    const description =
      typeof obj.description === "string" && obj.description.trim()
        ? obj.description.trim()
        : null;
    if (!title || !company) {
      return {
        ok: false,
        error: geminiError(
          "parse_error",
          "Could not extract a valid title/company from this URL.",
          true
        ),
      };
    }
    return { ok: true, job: { title, company, location, description } };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "URL extraction failed."),
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
  interviewStories: {
    title: string;
    situation: string;
    task: string;
    action: string;
    result: string;
  }[];
  negotiationStrategy: {
    scenario: string;
    script: string;
  }[];
};

export type JobEnrichmentGeminiResult =
  | { ok: true; data: JobEnrichmentPayload }
  | { ok: false; error: GeminiError };

export async function enrichJobDetailGemini(
  resumeText: string,
  bragSheetText: string,
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
  const bragSheet = bragSheetText.trim()
    ? bragSheetText.trim().length > MAX_RESUME
      ? bragSheetText.trim().slice(0, MAX_RESUME) + "\n[truncated…]"
      : bragSheetText.trim()
    : "";

  const desc = job.description?.trim();
  const jd =
    desc && desc.length > MAX_DESC
      ? desc.slice(0, MAX_DESC) + "…"
      : desc ?? "";

  const prompt = `"You are evaluating a candidate. You are provided with a standard ATS Resume AND a 'Brag Sheet' (a raw list of proof points, metrics, and career highlights).
CRITICAL RULE: Treat the Brag Sheet as absolute truth. When writing resume variants or interview stories, prioritize injecting the hard numbers and specific project names found in the Brag Sheet over the generic text found in the standard resume."

You help a job seeker and you can use live web search.
Actively search the web before answering. Ground your outputs in current information from multiple sources.
Specifically look for:
- company's recent news (last 6-12 months),
- company ratings and review trends from Glassdoor/AmbitionBox or similar,
- live salary benchmarks for this role/location from levels.fyi and comparable salary sites.
If evidence is sparse, be explicit in uncertainty and use conservative ranges.

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

Career highlights and proof points (hard stats, wins, outcomes):
"""
${bragSheet || "(none provided)"}
"""

Use the highlights as concrete evidence when evaluating fit and crafting tailored recommendations.

Return ONLY one JSON object (no markdown) with keys:
- "ctcBands": { "low": number, "mid": number, "high": number, "currency": string (e.g. USD or INR), "credibilityNote": string (1-2 sentences on uncertainty) }
- "ratingsWeb": { "glassdoorSummary": string (include useful rating/context signals found online), "ambitionBoxSummary": string, "disclaimer": string }
- "forumSentiment": { "summary": string (1-3 sentences), "label": string (e.g. Mixed), "disclaimer": string }
- "resumeGrade": number 0-100 (0 if no résumé)
- "resumeStrengths": string[]
- "resumeWeaknesses": string[]
- "areasToFix": string[] (actionable bullets)
- "interviewStories": array of exactly 5 objects, each:
  { "title": string, "situation": string, "task": string, "action": string, "result": string }
  (STAR format; use realistic evidence from resume/highlights and align each story to the role)
- "negotiationStrategy": array of exactly 3 objects, each:
  { "scenario": string, "script": string }
  (tactical salary/offer negotiation scripts or emails, including handling pushback and using estimated CTC context)

"Based on the candidate's resume and brag sheet, generate 5 behavioral interview stories tailored specifically to the requirements of this job description. 
Format each story strictly using the STAR+R method:
- Situation: Context of the project.
- Task: The specific problem to solve.
- Action: What the candidate actually did (highlighting skills relevant to THIS job).
- Result: The measurable impact.
- Reflection: What was learned.
Return this as a JSON array of objects."

No markdown, no commentary.`;

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
      interviewStories: Array.isArray(o.interviewStories)
        ? o.interviewStories
            .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
            .map((x) => ({
              title: typeof x.title === "string" ? x.title : "",
              situation: typeof x.situation === "string" ? x.situation : "",
              task: typeof x.task === "string" ? x.task : "",
              action: typeof x.action === "string" ? x.action : "",
              result: typeof x.result === "string" ? x.result : "",
            }))
            .filter(
              (x) =>
                x.title.trim() &&
                x.situation.trim() &&
                x.task.trim() &&
                x.action.trim() &&
                x.result.trim()
            )
            .slice(0, 5)
        : [],
      negotiationStrategy: Array.isArray(o.negotiationStrategy)
        ? o.negotiationStrategy
            .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
            .map((x) => ({
              scenario: typeof x.scenario === "string" ? x.scenario : "",
              script: typeof x.script === "string" ? x.script : "",
            }))
            .filter((x) => x.scenario.trim() && x.script.trim())
            .slice(0, 3)
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

export type ExperienceYearsExtracted = {
  experienceYearsMin: number | null;
  experienceYearsMax: number | null;
};

function normalizeExperienceYearsPair(
  min: unknown,
  max: unknown
): ExperienceYearsExtracted {
  const toInt = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return Math.round(v);
  };
  let lo = toInt(min);
  let hi = toInt(max);
  if (lo !== null) lo = Math.max(0, Math.min(60, lo));
  if (hi !== null) hi = Math.max(0, Math.min(60, hi));
  if (lo !== null && hi !== null && hi < lo) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  return { experienceYearsMin: lo, experienceYearsMax: hi };
}

/**
 * Batched extraction of required professional experience (years) from posting text.
 * Handles varied phrasing; returns nulls when nothing is stated or parsing fails for a row.
 */
export async function extractExperienceYearsBatch(
  items: {
    key: string;
    title: string;
    company: string;
    location?: string | null;
    description?: string | null;
  }[]
): Promise<
  | { ok: true; byKey: Record<string, ExperienceYearsExtracted> }
  | { ok: false; error: GeminiError }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: geminiError("unauthorized", "Sign in to use AI features.", false),
    };
  }

  const byKey: Record<string, ExperienceYearsExtracted> = {};
  for (const it of items) {
    byKey[it.key] = { experienceYearsMin: null, experienceYearsMax: null };
  }

  const needModel = items.filter((it) => (it.description ?? "").trim().length > 0);
  if (needModel.length === 0) {
    return { ok: true, byKey };
  }

  const CHUNK = 5;
  const MAX_TEXT = 6000;

  try {
    const model = getGeminiModel();
    for (let i = 0; i < needModel.length; i += CHUNK) {
      const chunk = needModel.slice(i, i + CHUNK);
      const payload = chunk.map((it) => ({
        key: it.key,
        title: it.title,
        company: it.company,
        location: it.location ?? null,
        postingText: (it.description ?? "").slice(0, MAX_TEXT),
      }));

      const prompt = `You extract REQUIRED years of professional work experience for each job from the posting text (not education duration unless it clearly substitutes for experience).

Input JSON array (one object per job):
${JSON.stringify(payload)}

Return ONLY a JSON array. One object per input job; each object MUST include the same "key" string as its input row.

Each object shape:
{ "key": string, "experienceYearsMin": number | null, "experienceYearsMax": number | null }

Rules:
- Whole years only: integers from 0 to 60, or null.
- Use null when that bound is not stated or cannot be inferred from the posting.
- "3+ years", "minimum 3 years", "at least three years", "3 yrs experience" → min=3, max=null
- "up to 2 years", "maximum 2 years" → min=null, max=2
- "2–5 years", "2-5 yrs", "between 2 and 5 years" → min=2, max=5
- "5+ years", "minimum 5+ years experience" → min=5, max=null
- "0-1 years", "entry level", "new grad" with explicit years → set sensible min/max; if only "entry level" with no years, prefer nulls unless a range is explicit.
- If the posting does not mention experience/years for the role, return both null.
- Do not infer numeric years from job title alone when the text does not state them.

No markdown, no commentary.`;

      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const arr = extractJsonArray(raw);
      if (!arr) {
        continue;
      }
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const key = typeof o.key === "string" ? o.key : "";
        if (!key || !Object.prototype.hasOwnProperty.call(byKey, key)) continue;
        const lo =
          o.experienceYearsMin ??
          o.minYears ??
          o.yearsMin ??
          o.minimumYears;
        const hi =
          o.experienceYearsMax ??
          o.maxYears ??
          o.yearsMax ??
          o.maximumYears;
        byKey[key] = normalizeExperienceYearsPair(lo, hi);
      }
    }
    return { ok: true, byKey };
  } catch (e) {
    return {
      ok: false,
      error: mapGeminiException(e, "Experience extraction failed."),
    };
  }
}
