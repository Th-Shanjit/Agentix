"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canonicalJobUrl, jobDedupeKey } from "@/lib/job-url";
import {
  toJobDTOFromJoin,
  type JobDTO,
} from "@/lib/jobs";

export type ToggleJobAppliedResult =
  | { ok: true; job: JobDTO }
  | { ok: false; error: string };

export type AddManualJobResult =
  | { ok: true; job: JobDTO }
  | { ok: false; error: string };

export async function addManualJob(data: {
  company: string;
  role: string;
  url: string;
}): Promise<AddManualJobResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, error: "Unauthorized." };
  }

  const company = data.company.trim();
  const role = data.role.trim();
  const link = data.url.trim();
  if (!company || !role || !link) {
    return { ok: false, error: "Company, role, and URL are required." };
  }

  if (!URL.canParse(link)) {
    return {
      ok: false,
      error: "Enter a valid URL (including https://).",
    };
  }

  try {
    const canonical = canonicalJobUrl(link);
    const dedupeKey = jobDedupeKey(link);

    const uj = await prisma.$transaction(async (tx) => {
      const listing = await tx.jobListing.upsert({
        where: { dedupeKey },
        create: {
          title: role,
          company,
          sourceUrl: canonical,
          dedupeKey,
          ctc: null,
          ctcSource: "MANUAL",
          source: "Manual",
          postedAt: new Date(),
        },
        update: {
          title: role,
          company,
          sourceUrl: canonical,
        },
      });

      const relation = await tx.userJob.upsert({
        where: {
          userId_jobListingId: { userId, jobListingId: listing.id },
        },
        create: {
          userId,
          jobListingId: listing.id,
          applied: false,
          saved: true,
        },
        update: { saved: true },
      });

      return tx.userJob.findUnique({
        where: { id: relation.id },
        include: { jobListing: true },
      });
    });

    if (!uj) {
      return { ok: false, error: "Could not load saved job." };
    }

    return { ok: true, job: toJobDTOFromJoin(uj) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not add job.";
    return { ok: false, error: msg };
  }
}

/** Add an existing catalog listing to the signed-in user’s list (saved). */
export async function saveJobToMyList(jobListingId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false as const, error: "Unauthorized." };
  }

  if (!jobListingId.trim()) {
    return { ok: false as const, error: "Missing job id." };
  }

  try {
    const exists = await prisma.jobListing.findFirst({
      where: { id: jobListingId, ingestionStatus: "VALIDATED" },
    });
    if (!exists) {
      return { ok: false as const, error: "Job not found." };
    }

    await prisma.userJob.upsert({
      where: {
        userId_jobListingId: { userId, jobListingId },
      },
      create: {
        userId,
        jobListingId,
        applied: false,
        saved: true,
      },
      update: { saved: true },
    });

    const uj = await prisma.userJob.findUnique({
      where: {
        userId_jobListingId: { userId, jobListingId },
      },
      include: { jobListing: true },
    });

    if (!uj) {
      return { ok: false as const, error: "Could not save." };
    }

    return { ok: true as const, job: toJobDTOFromJoin(uj) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save job.";
    return { ok: false as const, error: msg };
  }
}

/**
 * Updates `applied` for the signed-in user's row (scoped by `jobListingId` + `userId`).
 * @param applied — Target value after the toggle (what the UI switched to).
 */
export async function toggleJobAppliedStatus(
  jobListingId: string,
  applied: boolean
): Promise<ToggleJobAppliedResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, error: "Unauthorized." };
  }

  if (!jobListingId.trim()) {
    return { ok: false, error: "Missing job id." };
  }

  try {
    const result = await prisma.userJob.updateMany({
      where: { userId, jobListingId },
      data: { applied },
    });

    if (result.count === 0) {
      return { ok: false, error: "Job not found." };
    }

    const uj = await prisma.userJob.findUnique({
      where: {
        userId_jobListingId: { userId, jobListingId },
      },
      include: { jobListing: true },
    });

    if (!uj) {
      return { ok: false, error: "Job not found." };
    }

    return { ok: true, job: toJobDTOFromJoin(uj) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed.";
    return { ok: false, error: msg };
  }
}
