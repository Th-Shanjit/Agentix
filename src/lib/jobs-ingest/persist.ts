import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalJobUrl, jobDedupeKey } from "@/lib/job-url";
import { stageAlertCandidatesForListing } from "@/lib/alerts/stage";
import type { NormalizedJob } from "./types";
import { validateNormalizedJob } from "./validate";

/** Upsert validated jobs into JobListing (global catalog). */
export async function persistNormalizedJobs(
  rows: NormalizedJob[]
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  const PERSIST_CONCURRENCY = 10;

  for (let i = 0; i < rows.length; i += PERSIST_CONCURRENCY) {
    const chunk = rows.slice(i, i + PERSIST_CONCURRENCY);
    const outcomes = await Promise.all(
      chunk.map(async (j): Promise<"inserted" | "skipped"> => {
        const reason = validateNormalizedJob(j);
        if (reason) {
          return "skipped";
        }

        const canonical = canonicalJobUrl(j.applyUrl);
        const dedupeKey = jobDedupeKey(j.applyUrl);

        const ctcStr =
          j.salaryMin != null && j.salaryMax != null
            ? `${j.salaryCurrency} ${j.salaryMin.toLocaleString()}–${j.salaryMax.toLocaleString()}`
            : j.salaryMin != null
              ? `${j.salaryCurrency} from ${j.salaryMin.toLocaleString()}`
              : null;

        const countryJson: Prisma.InputJsonValue | undefined =
          j.countryCodes && j.countryCodes.length > 0 ? j.countryCodes : undefined;

        const data: Prisma.JobListingCreateInput = {
          title: j.title,
          company: j.company,
          location: j.location,
          sourceUrl: canonical,
          dedupeKey,
          ctc: ctcStr,
          ctcSource: "API",
          salaryMin: j.salaryMin,
          salaryMax: j.salaryMax,
          salaryCurrency: j.salaryCurrency,
          source: j.source,
          sourceName: j.sourceName,
          externalId: j.externalId,
          description: j.description,
          remotePolicy: j.remotePolicy,
          countryCodes: countryJson,
          experienceYearsMin: j.experienceYearsMin,
          experienceYearsMax: j.experienceYearsMax,
          postedAt: j.postedAt,
          ingestionStatus: "VALIDATED",
          rawPayload: j.raw as Prisma.InputJsonValue,
        };

        const listing = await prisma.jobListing.upsert({
          where: { dedupeKey },
          create: data,
          update: {
            title: j.title,
            company: j.company,
            location: j.location,
            ctc: ctcStr ?? undefined,
            salaryMin: j.salaryMin,
            salaryMax: j.salaryMax,
            salaryCurrency: j.salaryCurrency,
            sourceName: j.sourceName,
            description: j.description ?? undefined,
            remotePolicy: j.remotePolicy,
            countryCodes: countryJson,
            postedAt: j.postedAt,
            rawPayload: j.raw as Prisma.InputJsonValue,
            ingestionStatus: "VALIDATED",
          },
        });
        await Promise.all([
          stageAlertCandidatesForListing({
            jobListingId: listing.id,
            company: listing.company,
            role: listing.title,
          }),
        ]);
        return "inserted";
      })
    );

    for (const outcome of outcomes) {
      if (outcome === "inserted") inserted += 1;
      else skipped += 1;
    }
  }

  return { inserted, skipped };
}
