import { GoogleGenerativeAI } from "@google/generative-ai";

export const MODEL_FAST = "gemini-3-flash-preview";

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

export function geminiError(
  code: GeminiErrorCode,
  message: string,
  retryable: boolean
): GeminiError {
  return { code, message, retryable };
}

export function mapGeminiException(e: unknown, fallback: string): GeminiError {
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

/** Reliability of a CTC band (not the numeric spread). */
export type CtcConfidenceLevel = "LOW" | "MID" | "HIGH";

/** How trustworthy the salary band is — not the width of the numeric band. */
export function parseCtcConfidence(value: unknown): CtcConfidenceLevel {
  if (typeof value !== "string") return "LOW";
  const u = value.trim().toUpperCase();
  if (u === "HIGH" || u === "MID" || u === "LOW") return u;
  return "LOW";
}

/**
 * @param useSearch When true, enables Google Search grounding (higher latency).
 *   Use only for flows that need live market/web data (e.g. job enrichment, CTC estimates).
 */
export function getGeminiModel(useSearch = false) {
  const key = process.env.GEMINI_API_KEY;
  if (!key?.trim()) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  const genAI = new GoogleGenerativeAI(key);
  const base = { model: MODEL_FAST };

  if (!useSearch) {
    return genAI.getGenerativeModel(base);
  }

  try {
    return genAI.getGenerativeModel({
      ...base,
      tools: [{ googleSearch: {} }],
    } as unknown as Parameters<typeof genAI.getGenerativeModel>[0]);
  } catch {
    return genAI.getGenerativeModel(base);
  }
}
