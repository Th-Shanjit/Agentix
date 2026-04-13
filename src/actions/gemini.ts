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

export type AtsMatchResult = {
  matchPercentage: number;
  verdict: string;
  missingKeywords: string[];
  strengths: string[];
};

export type EstimateCTCResult =
  | { ok: true; text: string }
  | { ok: false; error: GeminiError };

export type MatchResumeATSResult =
  | { ok: true; data: AtsMatchResult }
  | { ok: false; error: GeminiError };

/** Estimate CTC for a role at a company in India (concise). */
export async function estimateCTC(
  jobRole: string,
  company: string
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

  try {
    const model = getModel();
    const prompt = `Estimate typical annual CTC (total compensation) in INR for the position "${role}" at "${company}" in India.

Rules:
- Be concise (under 180 words).
- Give a reasonable band or range when uncertain.
- Mention India / location context briefly.
- If public data is unclear, say so and give a qualitative estimate.
- Do not invent fake citations; you may mention "typical market" language without URLs.

Respond in plain text only, no JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
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
    return { ok: true, text };
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
  company: string
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
