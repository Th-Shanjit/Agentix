/**
 * Copies legacy `Job` rows into `JobListing` + `UserJob`, then deletes legacy rows.
 * After this runs successfully, remove the `Job` model from prisma/schema.prisma and `db push` again.
 *
 * Usage: `npx tsx scripts/migrate-legacy-job.mts`
 */
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

function canonicalJobUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return url.trim();
  }
}

function jobDedupeKey(url: string): string {
  const c = canonicalJobUrl(url);
  return createHash("sha256").update(c).digest("hex");
}

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.job.count();
  if (count === 0) {
    console.log("No legacy Job rows. Nothing to migrate.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Migrating ${count} legacy job rows…`);

  const legacy = await prisma.job.findMany();

  for (const row of legacy) {
    const canonical = canonicalJobUrl(row.link);
    const dedupeKey = jobDedupeKey(row.link);

    const listing = await prisma.jobListing.upsert({
      where: { dedupeKey },
      create: {
        title: row.role,
        company: row.company,
        sourceUrl: canonical,
        dedupeKey,
        ctc: row.ctc,
        source: row.source,
        postedAt: row.dateDiscovered,
      },
      update: {
        title: row.role,
        company: row.company,
        ctc: row.ctc ?? undefined,
        sourceUrl: canonical,
      },
    });

    await prisma.userJob.upsert({
      where: {
        userId_jobListingId: {
          userId: row.userId,
          jobListingId: listing.id,
        },
      },
      create: {
        userId: row.userId,
        jobListingId: listing.id,
        applied: row.applied,
        saved: true,
      },
      update: { applied: row.applied },
    });
  }

  await prisma.job.deleteMany({});
  console.log(
    "Migrated and cleared legacy Job rows. Remove the Job model from schema.prisma, then run db push."
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
