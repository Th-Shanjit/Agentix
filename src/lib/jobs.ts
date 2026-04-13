import type { JobListing, UserJob } from "@prisma/client";

/** Serializable job shape for client components. `id` is the shared `JobListing` id. */
export type JobDTO = {
  id: string;
  userId: string;
  company: string;
  role: string;
  dateDiscovered: string;
  ctc: string | null;
  link: string;
  applied: boolean;
  source: string;
  location?: string | null;
  description?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
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
    link: jl.sourceUrl,
    dateDiscovered: jl.postedAt.toISOString(),
    ctc: jl.ctc,
    applied: uj.applied,
    source: jl.source,
    location: jl.location,
    description: jl.description,
    salaryMin: jl.salaryMin,
    salaryMax: jl.salaryMax,
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
    link: listing.sourceUrl,
    dateDiscovered: listing.postedAt.toISOString(),
    ctc: listing.ctc,
    applied,
    source: listing.source,
    location: listing.location,
    description: listing.description,
    salaryMin: listing.salaryMin,
    salaryMax: listing.salaryMax,
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
    typeof j.source !== "string" ||
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
  return {
    id: j.id,
    userId: j.userId,
    company: j.company,
    role: j.role,
    dateDiscovered: date,
    ctc,
    link: j.link,
    applied: j.applied,
    source: j.source,
    location,
    description,
    salaryMin,
    salaryMax,
    remotePolicy,
  };
}
