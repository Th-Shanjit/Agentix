"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  enrichJobDetailGemini,
  fiveResumeToneVariants,
} from "@/actions/gemini-job-features";

const CACHE_MS = 24 * 60 * 60 * 1000;

function isFresh(updatedAt: Date) {
  return Date.now() - updatedAt.getTime() < CACHE_MS;
}

export type JobDetailPayload = {
  listing: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    sourceUrl: string;
    ctc: string | null;
    description: string | null;
    postedAt: string;
    source: string;
    remotePolicy: string | null;
    careersUrl: string | null;
  };
  enrichment: {
    ctcBands: unknown;
    ratingsWeb: unknown;
    forumSentiment: unknown;
    resumeGrade: number | null;
    resumeStrengths: string[];
    resumeWeaknesses: string[];
    areasToFix: string[];
    fiveToneResumes: unknown;
  } | null;
  userJob: { applied: boolean; saved: boolean } | null;
};

function parseResumeAnalysis(raw: unknown): {
  grade: number | null;
  strengths: string[];
  weaknesses: string[];
  areasToFix: string[];
} {
  if (!raw || typeof raw !== "object") {
    return { grade: null, strengths: [], weaknesses: [], areasToFix: [] };
  }
  const o = raw as Record<string, unknown>;
  return {
    grade: typeof o.grade === "number" ? o.grade : null,
    strengths: Array.isArray(o.strengths)
      ? o.strengths.filter((x): x is string => typeof x === "string")
      : [],
    weaknesses: Array.isArray(o.weaknesses)
      ? o.weaknesses.filter((x): x is string => typeof x === "string")
      : [],
    areasToFix: Array.isArray(o.areasToFix)
      ? o.areasToFix.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function buildPayload(
  listing: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    sourceUrl: string;
    ctc: string | null;
    description: string | null;
    postedAt: Date;
    source: string;
    remotePolicy: string | null;
    careersUrl: string | null;
  },
  enrich: {
    ctcBands: unknown;
    ratingsWeb: unknown;
    forumSentiment: unknown;
    resumeAnalysis: unknown;
    fiveToneResumes: unknown;
  } | null,
  uj: { applied: boolean; saved: boolean } | null
): JobDetailPayload {
  const ra = parseResumeAnalysis(enrich?.resumeAnalysis);

  return {
    listing: {
      id: listing.id,
      title: listing.title,
      company: listing.company,
      location: listing.location,
      sourceUrl: listing.sourceUrl,
      ctc: listing.ctc,
      description: listing.description,
      postedAt: listing.postedAt.toISOString(),
      source: listing.source,
      remotePolicy: listing.remotePolicy,
      careersUrl: listing.careersUrl,
    },
    enrichment: enrich
      ? {
          ctcBands: enrich.ctcBands,
          ratingsWeb: enrich.ratingsWeb,
          forumSentiment: enrich.forumSentiment,
          resumeGrade: ra.grade,
          resumeStrengths: ra.strengths,
          resumeWeaknesses: ra.weaknesses,
          areasToFix: ra.areasToFix,
          fiveToneResumes: enrich.fiveToneResumes,
        }
      : null,
    userJob: uj,
  };
}

export async function loadJobDetail(
  jobListingId: string
): Promise<
  | { ok: true; data: JobDetailPayload }
  | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;

  const listing = await prisma.jobListing.findFirst({
    where: { id: jobListingId, ingestionStatus: "VALIDATED" },
  });

  if (!listing) {
    return { ok: false, error: "Not found." };
  }

  if (!userId) {
    const enrich = await prisma.jobEnrichment.findUnique({
      where: { jobListingId },
    });
    return {
      ok: true,
      data: buildPayload(listing, enrich, null),
    };
  }

  const [user, uj, enrich] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { resumeText: true },
    }),
    prisma.userJob.findUnique({
      where: {
        userId_jobListingId: { userId, jobListingId },
      },
    }),
    prisma.jobEnrichment.findUnique({
      where: { jobListingId },
    }),
  ]);

  let enrichmentRow = enrich;

  if (!enrichmentRow || !isFresh(enrichmentRow.updatedAt)) {
    const r = await enrichJobDetailGemini(user?.resumeText ?? "", {
      title: listing.title,
      company: listing.company,
      location: listing.location,
      description: listing.description,
      ctc: listing.ctc,
    });

    if (!r.ok) {
      return { ok: false, error: r.error.message };
    }

    const p = r.data;
    enrichmentRow = await prisma.jobEnrichment.upsert({
      where: { jobListingId },
      create: {
        jobListingId,
        ctcBands: p.ctcBands as object,
        ratingsWeb: p.ratingsWeb as object,
        forumSentiment: p.forumSentiment as object,
        resumeAnalysis: {
          grade: p.resumeGrade,
          strengths: p.resumeStrengths,
          weaknesses: p.resumeWeaknesses,
          areasToFix: p.areasToFix,
        } as object,
      },
      update: {
        ctcBands: p.ctcBands as object,
        ratingsWeb: p.ratingsWeb as object,
        forumSentiment: p.forumSentiment as object,
        resumeAnalysis: {
          grade: p.resumeGrade,
          strengths: p.resumeStrengths,
          weaknesses: p.resumeWeaknesses,
          areasToFix: p.areasToFix,
        } as object,
      },
    });
  }

  return {
    ok: true,
    data: buildPayload(listing, enrichmentRow, uj),
  };
}

export async function generateFiveResumeTonesAction(jobListingId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false as const, error: "Unauthorized." };
  }

  const [user, listing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { resumeText: true },
    }),
    prisma.jobListing.findFirst({
      where: { id: jobListingId },
    }),
  ]);

  if (!user?.resumeText?.trim()) {
    return { ok: false as const, error: "Add résumé text on Profile first." };
  }
  if (!listing) {
    return { ok: false as const, error: "Job not found." };
  }

  const r = await fiveResumeToneVariants(user.resumeText, {
    title: listing.title,
    company: listing.company,
    description: listing.description,
  });

  if (!r.ok) {
    return { ok: false as const, error: r.error.message };
  }

  await prisma.jobEnrichment.upsert({
    where: { jobListingId },
    create: {
      jobListingId,
      fiveToneResumes: r.variants as object,
    },
    update: {
      fiveToneResumes: r.variants as object,
    },
  });

  return { ok: true as const, variants: r.variants };
}
