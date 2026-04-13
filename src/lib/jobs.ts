import type { Job } from "@prisma/client";

/** Serializable job shape for client components (RSC → client). */
export type JobDTO = Omit<Job, "dateDiscovered"> & {
  dateDiscovered: string;
};

export function toJobDTO(job: Job): JobDTO {
  return {
    ...job,
    dateDiscovered: job.dateDiscovered.toISOString(),
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
