import { getGeminiModel } from "@/lib/gemini-internal";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "for",
  "of",
  "to",
  "and",
  "in",
  "at",
  "with",
  "role",
  "job",
]);

const SENIOR_TOKENS = [
  "senior",
  "sr",
  "lead",
  "principal",
  "head",
  "director",
  "staff",
  "manager ii",
  "manager 2",
];

const PM_FAMILY_HINTS = [
  "product manager",
  "product management",
  "apm",
  "associate product",
  "jr product",
  "junior product",
];

export function parsePreferredRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s/+.-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s: string) {
  return normalize(s)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function hasSeniorToken(role: string) {
  const n = normalize(role);
  return SENIOR_TOKENS.some((tok) => n.includes(tok));
}

/**
 * Deterministic guardrail to keep Gemini calls low and block obvious mismatches.
 */
export function deterministicRoleGate(
  candidateRole: string,
  preferredRoles: string[]
): { ok: boolean; reason?: string } {
  const candidate = normalize(candidateRole);
  if (!candidate) return { ok: false, reason: "empty role" };

  const prefersSenior = preferredRoles.some((r) => hasSeniorToken(r));
  if (!prefersSenior && hasSeniorToken(candidate)) {
    return { ok: false, reason: "seniority ceiling exceeded" };
  }

  const preferredTokenSet = new Set(preferredRoles.flatMap((r) => tokenize(r)));
  const candidateTokens = tokenize(candidate);
  const overlap = candidateTokens.filter((t) => preferredTokenSet.has(t));
  if (overlap.length === 0) {
    return { ok: false, reason: "no lexical overlap" };
  }

  // PM-specific guardrail: if user is targeting PM-family roles, require PM-family cues.
  const pmIntent = preferredRoles.some((r) =>
    PM_FAMILY_HINTS.some((hint) => normalize(r).includes(hint))
  );
  if (pmIntent) {
    const hasPmCue = PM_FAMILY_HINTS.some((hint) => candidate.includes(hint));
    if (!hasPmCue) {
      return { ok: false, reason: "outside product-manager family" };
    }
  }

  return { ok: true };
}

export async function semanticRoleMatch(
  candidateRole: string,
  preferredRoles: string[]
): Promise<{ ok: boolean; matchedRole?: string; score?: number }> {
  if (!candidateRole.trim() || preferredRoles.length === 0) return { ok: false };
  const model = getGeminiModel();
  const prompt = `You classify role similarity for job alerts.
Candidate role: "${candidateRole.trim()}"
Preferred roles: ${JSON.stringify(preferredRoles)}

Rules:
- Match only if role family is the same.
- Exclude clearly unrelated functions.
- Exclude clearly too-senior variants unless preferred role itself is senior.

Return ONLY one JSON object:
{
  "match": boolean,
  "matchedRole": "one preferred role string or empty",
  "score": number
}`;
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false };
  const o = parsed as Record<string, unknown>;
  if (o.match !== true) return { ok: false };
  const matchedRole =
    typeof o.matchedRole === "string" && preferredRoles.includes(o.matchedRole)
      ? o.matchedRole
      : preferredRoles[0];
  const score =
    typeof o.score === "number" && Number.isFinite(o.score) ? o.score : 70;
  return { ok: true, matchedRole, score: Math.max(0, Math.min(100, score)) };
}
