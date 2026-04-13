"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/auth";

const MODEL_FAST = "gemini-3-flash-preview";

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

/** Estimate CTC for a role at a company in India (concise). */
export async function estimateCTC(jobRole: string, company: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Unauthorized." };
  }

  const role = jobRole.trim();
  const co = company.trim();
  if (!role || !co) {
    return { ok: false as const, error: "Role and company are required." };
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
      return { ok: false as const, error: "No response from the model." };
    }
    return { ok: true as const, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "CTC estimate failed.";
    return { ok: false as const, error: msg };
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
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Unauthorized." };
  }

  const text = resumeText.trim();
  const role = jobRole.trim();
  const co = company.trim();

  if (!text) {
    return { ok: false as const, error: "Resume text is empty." };
  }
  if (!role || !co) {
    return { ok: false as const, error: "Role and company are required." };
  }

  const snippet = text.length > MAX_RESUME_CHARS
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
        ok: false as const,
        error: "Could not parse ATS result. Try again.",
      };
    }
    return { ok: true as const, data: parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ATS match failed.";
    return { ok: false as const, error: msg };
  }
}
