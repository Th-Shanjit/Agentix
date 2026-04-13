"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/auth";

const MODEL_FAST = "gemini-3-flash-preview";

/** Structured failure for UI: messaging, retry affordance, and analytics-friendly codes. */
export type GeminiErrorCode =
  | "unauthorized"
  | "validation"
  | "config"
  | "model_empty"
  | "parse_error"
  | "rate_limit"
  | "quota"
  | "network"
  | "unknown";

export type GeminiError = {
  code: GeminiErrorCode;
  message: string;
  retryable: boolean;
};

function geminiError(
  code: GeminiErrorCode,
  message: string,
  retryable: boolean
): GeminiError {
  return { code, message, retryable };
}

function mapGeminiException(e: unknown, fallback: string): GeminiError {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();

  if (
    lower.includes("gemini_api_key") ||
    lower.includes("not configured") ||
    (lower.includes("api key") && lower.includes("missing"))
  ) {
    return geminiError(
      "config",
      "Gemini is not configured on the server (set GEMINI_API_KEY).",
      false
    );
  }

  if (
    lower.includes("429") ||
    lower.includes("resource exhausted") ||
    lower.includes("too many requests")
  ) {
    return geminiError(
      "rate_limit",
      "The model is rate-limited. Wait a moment and try again.",
      true
    );
  }

  if (
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("exceeded your") ||
    lower.includes("limit exceeded")
  ) {
    return geminiError(
      "quota",
      "API quota or billing limit may be exceeded. Check Google AI Studio or Cloud billing.",
      false
    );
  }

  if (
    lower.includes("api key") ||
    (lower.includes("invalid argument") && lower.includes("key")) ||
    lower.includes("permission denied") ||
    msg.includes("401") ||
    msg.includes("403")
  ) {
    return geminiError(
      "config",
      "The Gemini API key is invalid or this model is not enabled for your project.",
      false
    );
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("econn") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("network") ||
    lower.includes("socket") ||
    lower.includes("getaddrinfo")
  ) {
    return geminiError(
      "network",
      "Network error. Check your connection and try again.",
      true
    );
  }

  const trimmed = msg.trim();
  return geminiError(
    "unknown",
    trimmed || fallback,
    true
  );
}

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key?.trim()) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: MODEL_FAST });
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
