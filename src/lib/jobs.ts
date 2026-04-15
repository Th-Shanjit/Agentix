import type { JobListing, UserJob } from "@prisma/client";

function ctcConfidenceFromRaw(
  v: unknown
): "LOW" | "MID" | "HIGH" | undefined {
  if (typeof v !== "string") return undefined;
  const u = v.trim().toUpperCase();
  if (u === "HIGH" || u === "MID" || u === "LOW") return u;
  return undefined;
}

/** Serializable job shape for client components. `id` is the shared `JobListing` id. */
export type JobDTO = {
  id: string;
  userId: string;
  company: string;
  role: string;
  archetype?: string | null;
  relevanceScore?: number | null;
  dateDiscovered: string;
  ctc: string | null;
  link: string;
  applied: boolean;
  appliedAt?: string | null;
  ctcRange?: {
    low: number;
    mid: number;
    high: number;
    currency: string;
    period: "YEARLY" | "MONTHLY";
    format: "LPA" | "K" | "RAW";
    /** Estimate reliability (not numeric spread). */
    confidence?: "LOW" | "MID" | "HIGH";
  } | null;
  notYetListed?: boolean;
  location?: string | null;
  description?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  experienceYearsMin?: number | null;
  experienceYearsMax?: number | null;
  remotePolicy?: string | null;
};

export function toJobDTOFromJoin(
  uj: UserJob & { jobListing: JobListing }
): JobDTO {
  const jl = uj.jobListing;
  return {
    id: jl.id,
    userId: uj.userId,
    company: jl.company,
    role: jl.title,
    archetype: jl.archetype,
    link: jl.sourceUrl,
    dateDiscovered: jl.postedAt.toISOString(),
    ctc: jl.ctc,
    applied: uj.applied,
    appliedAt: uj.appliedAt ? uj.appliedAt.toISOString() : null,
    ctcRange:
      jl.rawPayload &&
      typeof jl.rawPayload === "object" &&
      !Array.isArray(jl.rawPayload) &&
      "ctcRange" in (jl.rawPayload as Record<string, unknown>) &&
      (jl.rawPayload as { ctcRange?: unknown }).ctcRange &&
      typeof (jl.rawPayload as { ctcRange: unknown }).ctcRange === "object" &&
      typeof (
        (jl.rawPayload as { ctcRange: Record<string, unknown> }).ctcRange.low
      ) === "number" &&
      typeof (
        (jl.rawPayload as { ctcRange: Record<string, unknown> }).ctcRange.mid
      ) === "number" &&
      typeof (
        (jl.rawPayload as { ctcRange: Record<string, unknown> }).ctcRange.high
      ) === "number" &&
      typeof (
        (jl.rawPayload as { ctcRange: Record<string, unknown> }).ctcRange
          .currency
      ) === "string"
        ? (() => {
            const cr = (jl.rawPayload as { ctcRange: Record<string, unknown> })
              .ctcRange;
            const conf = ctcConfidenceFromRaw(cr.confidence);
            return {
              low: Number(cr.low),
              mid: Number(cr.mid),
              high: Number(cr.high),
              currency: String(cr.currency),
              period:
                cr.period === "MONTHLY" ? ("MONTHLY" as const) : ("YEARLY" as const),
              format:
                cr.format === "LPA" || cr.format === "K"
                  ? (cr.format as "LPA" | "K")
                  : ("RAW" as const),
              ...(conf ? { confidence: conf } : {}),
            };
          })()
        : null,
    relevanceScore:
      jl.rawPayload &&
      typeof jl.rawPayload === "object" &&
      !Array.isArray(jl.rawPayload) &&
      typeof (jl.rawPayload as { relevanceScore?: unknown }).relevanceScore ===
        "number"
        ? Number((jl.rawPayload as { relevanceScore: number }).relevanceScore)
        : null,
    notYetListed: jl.title === "Not yet listed",
    location: jl.location,
    description: jl.description,
    salaryMin: jl.salaryMin,
    salaryMax: jl.salaryMax,
    experienceYearsMin: jl.experienceYearsMin,
    experienceYearsMax: jl.experienceYearsMax,
    remotePolicy: jl.remotePolicy,
  };
}

export function toJobDTOFromListing(
  listing: JobListing,
  userId: string,
  applied: boolean
): JobDTO {
  return {
    id: listing.id,
    userId,
    company: listing.company,
    role: listing.title,
    archetype: listing.archetype,
    link: listing.sourceUrl,
    dateDiscovered: listing.postedAt.toISOString(),
    ctc: listing.ctc,
    applied,
    appliedAt: null,
    ctcRange: null,
    relevanceScore: null,
    notYetListed: listing.title === "Not yet listed",
    location: listing.location,
    description: listing.description,
    salaryMin: listing.salaryMin,
    salaryMax: listing.salaryMax,
    experienceYearsMin: listing.experienceYearsMin,
    experienceYearsMax: listing.experienceYearsMax,
    remotePolicy: listing.remotePolicy,
  };
}

export function normalizeJobFromApi(data: unknown): JobDTO | null {
  if (!data || typeof data !== "object") return null;
  const j = data as Record<string, unknown>;
  if (
    typeof j.id !== "string" ||
    typeof j.company !== "string" ||
    typeof j.role !== "string" ||
    typeof j.link !== "string" ||
    typeof j.applied !== "boolean" ||
    typeof j.userId !== "string"
  ) {
    return null;
  }
  let date: string | null = null;
  if (typeof j.dateDiscovered === "string") {
    date = j.dateDiscovered;
  }
  if (!date) return null;
  const ctc =
    j.ctc === null || j.ctc === undefined
      ? null
      : typeof j.ctc === "string"
        ? j.ctc
        : null;
  const location =
    j.location === null || j.location === undefined
      ? null
      : typeof j.location === "string"
        ? j.location
        : null;
  const description =
    j.description === null || j.description === undefined
      ? null
      : typeof j.description === "string"
        ? j.description
        : null;
  const salaryMin =
    typeof j.salaryMin === "number" && Number.isFinite(j.salaryMin)
      ? j.salaryMin
      : null;
  const salaryMax =
    typeof j.salaryMax === "number" && Number.isFinite(j.salaryMax)
      ? j.salaryMax
      : null;
  const remotePolicy =
    j.remotePolicy === null || j.remotePolicy === undefined
      ? null
      : typeof j.remotePolicy === "string"
        ? j.remotePolicy
        : null;
  const experienceYearsMin =
    typeof j.experienceYearsMin === "number" &&
    Number.isFinite(j.experienceYearsMin)
      ? j.experienceYearsMin
      : null;
  const experienceYearsMax =
    typeof j.experienceYearsMax === "number" &&
    Number.isFinite(j.experienceYearsMax)
      ? j.experienceYearsMax
      : null;
  const appliedAt =
    typeof j.appliedAt === "string"
      ? j.appliedAt
      : j.appliedAt === null || j.appliedAt === undefined
        ? null
        : null;
  const ctcRange: JobDTO["ctcRange"] =
    j.ctcRange &&
    typeof j.ctcRange === "object" &&
    typeof (j.ctcRange as Record<string, unknown>).low === "number" &&
    typeof (j.ctcRange as Record<string, unknown>).mid === "number" &&
    typeof (j.ctcRange as Record<string, unknown>).high === "number" &&
    typeof (j.ctcRange as Record<string, unknown>).currency === "string"
      ? (() => {
          const cr = j.ctcRange as Record<string, unknown>;
          const conf = ctcConfidenceFromRaw(cr.confidence);
          return {
            low: cr.low as number,
            mid: cr.mid as number,
            high: cr.high as number,
            currency: cr.currency as string,
            period:
              cr.period === "MONTHLY" ? ("MONTHLY" as const) : ("YEARLY" as const),
            format:
              cr.format === "LPA" || cr.format === "K"
                ? (cr.format as "LPA" | "K")
                : "RAW",
            ...(conf ? { confidence: conf } : {}),
          };
        })()
      : null;
  const archetype =
    j.archetype === null || j.archetype === undefined
      ? null
      : typeof j.archetype === "string"
        ? j.archetype
        : null;
  const relevanceScore =
    typeof j.relevanceScore === "number" && Number.isFinite(j.relevanceScore)
      ? j.relevanceScore
      : null;
  const notYetListed = Boolean(j.notYetListed);
  return {
    id: j.id,
    userId: j.userId,
    company: j.company,
    role: j.role,
    archetype,
    relevanceScore,
    dateDiscovered: date,
    ctc,
    link: j.link,
    applied: j.applied,
    appliedAt,
    ctcRange,
    notYetListed,
    location,
    description,
    salaryMin,
    salaryMax,
    experienceYearsMin,
    experienceYearsMax,
    remotePolicy,
  };
}
