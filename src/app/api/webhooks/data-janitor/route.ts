import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const DUPLICATE_WINDOW_DAYS = 7;
const ARCHIVE_AFTER_DAYS = 60;

function toInputJson(
  value: Prisma.JsonValue
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

type ListingLite = {
  id: string;
  title: string;
  company: string;
  postedAt: Date;
};

function getSecret(request: Request) {
  const header = request.headers.get("x-agentix-secret");
  if (header) return header;
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function groupByExactTitleCompany(items: ListingLite[]) {
  const byKey = new Map<string, ListingLite[]>();
  for (const it of items) {
    const key = `${it.title}__${it.company}`;
    const existing = byKey.get(key);
    if (existing) existing.push(it);
    else byKey.set(key, [it]);
  }
  return byKey;
}

function pickDuplicatesByWindow(items: ListingLite[]) {
  const sorted = [...items].sort(
    (a, b) => b.postedAt.getTime() - a.postedAt.getTime()
  );
  const msWindow = DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const pairs: { keepId: string; removeId: string }[] = [];

  let keep: ListingLite | null = null;
  for (const row of sorted) {
    if (!keep) {
      keep = row;
      continue;
    }
    if (keep.postedAt.getTime() - row.postedAt.getTime() <= msWindow) {
      pairs.push({ keepId: keep.id, removeId: row.id });
      continue;
    }
    keep = row;
  }

  return pairs;
}

async function mergeListingIntoCanonical(keepId: string, removeId: string) {
  await prisma.$transaction(async (tx) => {
    const userJobs = await tx.userJob.findMany({
      where: { jobListingId: removeId },
      select: { id: true, userId: true, applied: true, appliedAt: true, saved: true },
    });
    for (const uj of userJobs) {
      await tx.userJob.upsert({
        where: {
          userId_jobListingId: { userId: uj.userId, jobListingId: keepId },
        },
        create: {
          userId: uj.userId,
          jobListingId: keepId,
          applied: uj.applied,
          appliedAt: uj.appliedAt,
          saved: uj.saved,
        },
        update: {
          applied: uj.applied,
          appliedAt: uj.appliedAt,
          saved: uj.saved,
        },
      });
      await tx.userJob.delete({ where: { id: uj.id } });
    }

    const caches = await tx.jobMatchCache.findMany({
      where: { jobListingId: removeId },
      select: {
        id: true,
        userId: true,
        relevanceScore: true,
        fitScore: true,
        upsideScore: true,
        strengths: true,
        weaknesses: true,
      },
    });
    for (const cache of caches) {
      await tx.jobMatchCache.upsert({
        where: {
          userId_jobListingId: { userId: cache.userId, jobListingId: keepId },
        },
        create: {
          userId: cache.userId,
          jobListingId: keepId,
          relevanceScore: cache.relevanceScore,
          fitScore: cache.fitScore,
          upsideScore: cache.upsideScore,
          strengths: toInputJson(cache.strengths),
          weaknesses: toInputJson(cache.weaknesses),
        },
        update: {
          relevanceScore: cache.relevanceScore,
          fitScore: cache.fitScore,
          upsideScore: cache.upsideScore,
          strengths: toInputJson(cache.strengths),
          weaknesses: toInputJson(cache.weaknesses),
        },
      });
      await tx.jobMatchCache.delete({ where: { id: cache.id } });
    }

    const events = await tx.alertEvent.findMany({
      where: { jobListingId: removeId },
      select: {
        id: true,
        userId: true,
        trackerId: true,
        matchedRole: true,
        sentAt: true,
      },
    });
    for (const ev of events) {
      await tx.alertEvent.upsert({
        where: {
          userId_jobListingId: { userId: ev.userId, jobListingId: keepId },
        },
        create: {
          userId: ev.userId,
          jobListingId: keepId,
          trackerId: ev.trackerId,
          matchedRole: ev.matchedRole,
          sentAt: ev.sentAt,
        },
        update: {
          trackerId: ev.trackerId,
          matchedRole: ev.matchedRole,
          sentAt: ev.sentAt,
        },
      });
      await tx.alertEvent.delete({ where: { id: ev.id } });
    }

    const keepEnrich = await tx.jobEnrichment.findUnique({
      where: { jobListingId: keepId },
      select: { id: true },
    });
    const dupEnrich = await tx.jobEnrichment.findUnique({
      where: { jobListingId: removeId },
      select: { id: true },
    });
    if (!keepEnrich && dupEnrich) {
      await tx.jobEnrichment.update({
        where: { id: dupEnrich.id },
        data: { jobListingId: keepId },
      });
    } else if (keepEnrich && dupEnrich) {
      await tx.jobEnrichment.delete({ where: { id: dupEnrich.id } });
    }

    await tx.jobListing.delete({ where: { id: removeId } });
  });
}

async function runDataJanitor() {
  const activeListings = await prisma.jobListing.findMany({
    where: { archivedAt: null },
    select: { id: true, title: true, company: true, postedAt: true },
    orderBy: [{ company: "asc" }, { title: "asc" }, { postedAt: "desc" }],
  });

  const groups = groupByExactTitleCompany(activeListings);
  const dedupePairs: { keepId: string; removeId: string }[] = [];
  for (const arr of Array.from(groups.values())) {
    if (arr.length < 2) continue;
    dedupePairs.push(...pickDuplicatesByWindow(arr));
  }

  let mergedDuplicates = 0;
  for (const pair of dedupePairs) {
    await mergeListingIntoCanonical(pair.keepId, pair.removeId);
    mergedDuplicates += 1;
  }

  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const archiveResult = await prisma.jobListing.updateMany({
    where: { archivedAt: null, postedAt: { lt: cutoff } },
    data: { archivedAt: new Date() },
  });

  return {
    scannedActiveListings: activeListings.length,
    mergedDuplicates,
    archivedCount: archiveResult.count,
    duplicateWindowDays: DUPLICATE_WINDOW_DAYS,
    archiveAfterDays: ARCHIVE_AFTER_DAYS,
  };
}

async function handle(request: Request) {
  const expected = process.env.CRON_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Data janitor webhook is not configured." },
      { status: 503 }
    );
  }

  const provided = getSecret(request);
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runDataJanitor();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
