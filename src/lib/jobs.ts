import type { JobListing, UserJob } from "@prisma/client";

/** Serializable job shape for client components (matches legacy `Job` fields). `id` is the shared `JobListing` id. */
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
};

export function toJobDTOFromJoin(
  uj: UserJob & { jobListing: JobListing }
): JobDTO {
  return {
    id: uj.jobListing.id,
    userId: uj.userId,
    company: uj.jobListing.company,
    role: uj.jobListing.title,
    link: uj.jobListing.sourceUrl,
    dateDiscovered: uj.jobListing.postedAt.toISOString(),
    ctc: uj.jobListing.ctc,
    applied: uj.applied,
    source: uj.jobListing.source,
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
  };
}
