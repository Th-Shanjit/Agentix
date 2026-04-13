"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { batchSearchMatch } from "@/actions/gemini-job-features";

const CHUNK = 6;

/** Compute AI match scores for listings and cache for the signed-in user. */
export async function computeAndCacheMatches(jobIds: string[]) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false as const, error: "Unauthorized." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { resumeText: true },
  });

  if (!user?.resumeText?.trim()) {
    return {
      ok: false as const,
      error: "Add résumé text on Profile to run match scoring.",
    };
  }

  const ids = Array.from(new Set(jobIds)).filter(Boolean);
  if (ids.length === 0) {
    return { ok: true as const, updated: 0 };
  }

  const listings = await prisma.jobListing.findMany({
    where: { id: { in: ids }, ingestionStatus: "VALIDATED" },
    select: {
      id: true,
      title: true,
      company: true,
      description: true,
    },
  });

  let updated = 0;

  for (let i = 0; i < listings.length; i += CHUNK) {
    const chunk = listings.slice(i, i + CHUNK);
    const r = await batchSearchMatch(user.resumeText, chunk);
    if (!r.ok) {
      return { ok: false as const, error: r.error.message };
    }

    for (const m of r.matches) {
      await prisma.jobMatchCache.upsert({
        where: {
          userId_jobListingId: { userId, jobListingId: m.jobId },
        },
        create: {
          userId,
          jobListingId: m.jobId,
          relevanceScore: m.relevanceScore,
          fitScore: m.fitScore,
          upsideScore: m.upsideScore,
          strengths: m.strengths,
          weaknesses: m.weaknesses,
        },
        update: {
          relevanceScore: m.relevanceScore,
          fitScore: m.fitScore,
          upsideScore: m.upsideScore,
          strengths: m.strengths,
          weaknesses: m.weaknesses,
        },
      });
      updated += 1;
    }
  }

  return { ok: true as const, updated };
}
