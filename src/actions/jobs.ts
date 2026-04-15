"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canonicalJobUrl, jobDedupeKey } from "@/lib/job-url";
import { load } from "cheerio";
import {
  batchSearchMatch,
  extractJobFromScrapeWithGemini,
  extractExperienceYearsBatch,
  rankRoleSimilarity,
} from "@/actions/gemini-job-features";
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

export type ImportUrlsResult =
  | {
      ok: true;
      addedCount: number;
      skippedCount: number;
      jobs: JobDTO[];
      notes: string[];
    }
  | { ok: false; error: string };

export type UploadJobInput = {
  company: string;
  role?: string | null;
  intendedRole?: string | null;
  link?: string | null;
  source?: string | null;
  description?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
  ctc?: string | null;
  dateDiscovered?: string | null;
};

export type ImportUploadJobsResult =
  | {
      ok: true;
      addedCount: number;
      aiConsidered: number;
      aiMatched: number;
      skippedInvalid: number;
      jobs: JobDTO[];
    }
  | { ok: false; error: string };

const MATCH_CHUNK = 6;
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; AgentixBot/1.0; +https://agentix.app)",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseGreenhouse(url: URL): { board: string; jobId: string } | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("jobs");
  if (idx <= 0 || idx + 1 >= parts.length) return null;
  const board = parts[idx - 1];
  const jobId = parts[idx + 1]?.replace(/\D/g, "") ?? "";
  return board && jobId ? { board, jobId } : null;
}

async function tryGreenhouseApi(url: URL): Promise<{
  ok: true;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
} | null> {
  if (!/greenhouse\.io$/i.test(url.hostname)) return null;
  const parsed = parseGreenhouse(url);
  if (!parsed) return null;
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.board)}/jobs/${encodeURIComponent(parsed.jobId)}`;
  const res = await fetchWithTimeout(apiUrl);
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const company = parsed.board.replace(/[-_]+/g, " ").trim();
  const locRaw =
    data.location && typeof data.location === "object"
      ? (data.location as Record<string, unknown>).name
      : null;
  const location = typeof locRaw === "string" && locRaw.trim() ? locRaw.trim() : null;
  const description =
    typeof data.content === "string"
      ? load(data.content).text().replace(/\s+/g, " ").trim()
      : null;
  if (!title || !company) return null;
  return { ok: true, title, company, location, description };
}

function parseLever(url: URL): { company: string; postingId: string } | null {
  if (!/lever\.co$/i.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { company: parts[0], postingId: parts[1] };
}

async function tryLeverApi(url: URL): Promise<{
  ok: true;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
} | null> {
  const parsed = parseLever(url);
  if (!parsed) return null;
  const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(parsed.company)}/${encodeURIComponent(parsed.postingId)}?mode=json`;
  const res = await fetchWithTimeout(apiUrl);
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  const title = typeof data.text === "string" ? data.text.trim() : "";
  const company = parsed.company.replace(/[-_]+/g, " ").trim();
  const categories =
    data.categories && typeof data.categories === "object"
      ? (data.categories as Record<string, unknown>)
      : null;
  const location =
    categories && typeof categories.location === "string" && categories.location.trim()
      ? categories.location.trim()
      : null;
  const description =
    typeof data.descriptionPlain === "string" && data.descriptionPlain.trim()
      ? data.descriptionPlain.trim()
      : typeof data.description === "string"
        ? load(data.description).text().replace(/\s+/g, " ").trim()
        : null;
  if (!title || !company) return null;
  return { ok: true, title, company, location, description };
}

async function scrapeGenericUrl(url: string) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status})`);
  }
  const html = await res.text();
  const $ = load(html);
  const titleTag = $("title").first().text().trim();
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const metaOgTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  return {
    titleTag,
    metaDescription,
    metaOgTitle,
    bodyText: bodyText.slice(0, 30000),
  };
}

function normalizeForMatch(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function allowsRemote(remotePref: string, job: UploadJobInput) {
  const rp = normalizeForMatch(job.remotePolicy);
  const loc = normalizeForMatch(job.location);
  const isRemote = rp.includes("remote") || loc.includes("remote");
  const isHybrid = rp.includes("hybrid") || loc.includes("hybrid");
  const isOnsite =
    rp.includes("onsite") || rp.includes("on-site") || loc.includes("onsite");
  if (remotePref === "REMOTE_ONLY") return isRemote;
  if (remotePref === "HYBRID") return isHybrid || isRemote;
  if (remotePref === "ONSITE") return isOnsite || (!isRemote && !isHybrid);
  return true;
}

function allowsCountry(countries: string[], job: UploadJobInput) {
  if (countries.length === 0) return true;
  const hay = `${job.location ?? ""} ${job.description ?? ""}`.toLowerCase();
  return countries.some((c) => hay.includes(c.toLowerCase()));
}

export async function importUploadJobs(data: {
  jobs: UploadJobInput[];
  minRelevance?: number;
}): Promise<ImportUploadJobsResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Unauthorized." };

  const unique: UploadJobInput[] = [];
  const seen = new Set<string>();
  let skippedInvalid = 0;
  for (const raw of data.jobs ?? []) {
    const company = raw.company?.trim() ?? "";
    const role = raw.role?.trim() ?? "";
    const link = raw.link?.trim() ?? "";
    if (!company) {
      skippedInvalid += 1;
      continue;
    }
    const dedupe = link && URL.canParse(link) ? jobDedupeKey(link) : `company:${company.toLowerCase()}:${role.toLowerCase() || "not-listed"}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    unique.push({
      company,
      role: role || "Not yet listed",
      intendedRole: role || null,
      link: link && URL.canParse(link) ? link : null,
      source: raw.source?.trim() || "Upload",
      description: raw.description?.trim() || null,
      location: raw.location?.trim() || null,
      remotePolicy: raw.remotePolicy?.trim() || null,
      ctc: raw.ctc?.trim() || null,
      dateDiscovered: raw.dateDiscovered?.trim() || null,
    });
  }

  if (unique.length === 0) {
    return {
      ok: true,
      addedCount: 0,
      aiConsidered: 0,
      aiMatched: 0,
      skippedInvalid,
      jobs: [],
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      resumeText: true,
      bragSheet: true,
      preferredCountries: true,
      searchRemotePreference: true,
    },
  });
  if (!user?.resumeText?.trim()) {
    return {
      ok: false,
      error: "Upload your resume on Profile before AI filtering imports.",
    };
  }

  const minRelevance = Math.min(100, Math.max(0, data.minRelevance ?? 60));
  const preferredCountries = Array.isArray(user.preferredCountries)
    ? user.preferredCountries.filter((x): x is string => typeof x === "string")
    : [];
  const prefsFiltered = unique.filter(
    (j) =>
      allowsRemote(user.searchRemotePreference ?? "ANY", j) &&
      allowsCountry(preferredCountries, j)
  );

  if (prefsFiltered.length === 0) {
    return {
      ok: true,
      addedCount: 0,
      aiConsidered: 0,
      aiMatched: 0,
      skippedInvalid,
      jobs: [],
    };
  }

  const matchCandidates = prefsFiltered.map((job, idx) => ({
    id: `upload-${idx}`,
    title: job.role ?? "Not yet listed",
    company: job.company,
    description: job.description,
  }));

  const allowedTempIds = new Set<string>();
  const matchByTempId = new Map<
    string,
    { relevanceScore: number; archetype: string }
  >();
  for (let i = 0; i < matchCandidates.length; i += MATCH_CHUNK) {
    const chunk = matchCandidates.slice(i, i + MATCH_CHUNK);
    const matchResult = await batchSearchMatch(
      user.resumeText,
      user.bragSheet ?? "",
      chunk
    );
    if (!matchResult.ok) {
      return { ok: false, error: matchResult.error.message };
    }
    for (const row of matchResult.matches) {
      matchByTempId.set(row.jobId, {
        relevanceScore: row.relevanceScore,
        archetype: row.archetype,
      });
      if (row.relevanceScore >= minRelevance) {
        allowedTempIds.add(row.jobId);
      }
    }
  }

  const aiMatchedJobs = prefsFiltered
    .map((job, idx) => ({ job, tempId: `upload-${idx}` }))
    .filter((x) => allowedTempIds.has(x.tempId));

  const expInputs = aiMatchedJobs.map((item, idx) => ({
    key: `u${idx}`,
    title: (item.job.role ?? "Not yet listed").trim() || "Not yet listed",
    company: item.job.company,
    location: item.job.location,
    description: item.job.description,
  }));

  let experienceByKey: Record<
    string,
    { experienceYearsMin: number | null; experienceYearsMax: number | null }
  > = {};
  if (expInputs.length > 0) {
    const expResult = await extractExperienceYearsBatch(expInputs);
    if (expResult.ok) {
      experienceByKey = expResult.byKey;
    }
  }

  const savedJobs: JobDTO[] = [];
  const existingByCompany = await prisma.jobListing.findMany({
    where: { userJobs: { some: { userId } } },
    select: { id: true, company: true, title: true },
  });

  for (let jobIdx = 0; jobIdx < aiMatchedJobs.length; jobIdx++) {
    const job = aiMatchedJobs[jobIdx].job;
    const matchMeta = matchByTempId.get(aiMatchedJobs[jobIdx].tempId) ?? null;
    const extracted =
      experienceByKey[`u${jobIdx}`] ?? {
        experienceYearsMin: null,
        experienceYearsMax: null,
      };
    const intendedRole = job.intendedRole?.trim() || job.role?.trim() || "";
    const companyExisting = existingByCompany.filter(
      (r) => r.company.toLowerCase() === job.company.toLowerCase()
    );
    if (intendedRole && companyExisting.length > 0) {
      const related = await rankRoleSimilarity(
        intendedRole,
        companyExisting.map((r) => r.title)
      );
      if (related.ok && related.related.length > 0) {
        const relatedRows = companyExisting.filter((r) =>
          related.related.includes(r.title)
        );
        for (const rel of relatedRows) {
          const uj = await prisma.$transaction(async (tx) => {
            const relation = await tx.userJob.upsert({
              where: {
                userId_jobListingId: { userId, jobListingId: rel.id },
              },
              create: {
                userId,
                jobListingId: rel.id,
                applied: false,
                appliedAt: null,
                saved: true,
              },
              update: { saved: true },
            });
            return tx.userJob.findUnique({
              where: { id: relation.id },
              include: { jobListing: true },
            });
          });
          if (uj) savedJobs.push(toJobDTOFromJoin(uj));
        }
        continue;
      }
    }

    const hasLink = Boolean(job.link && URL.canParse(job.link));
    const canonical = hasLink
      ? canonicalJobUrl(String(job.link))
      : `https://placeholder.agentix.local/company/${encodeURIComponent(job.company.toLowerCase())}`;
    const dedupeKey = hasLink
      ? jobDedupeKey(String(job.link))
      : `placeholder:${job.company.toLowerCase()}:${(job.role ?? "not yet listed").toLowerCase()}`;
    const existingListing = await prisma.jobListing.findUnique({
      where: { dedupeKey },
      select: { rawPayload: true },
    });
    const existingPayload =
      existingListing?.rawPayload &&
      typeof existingListing.rawPayload === "object" &&
      !Array.isArray(existingListing.rawPayload)
        ? (existingListing.rawPayload as Record<string, unknown>)
        : {};
    const mergedPayload =
      matchMeta && Number.isFinite(matchMeta.relevanceScore)
        ? ({
            ...existingPayload,
            relevanceScore: Math.round(matchMeta.relevanceScore),
          } as object)
        : Object.keys(existingPayload).length > 0
          ? (existingPayload as object)
          : undefined;
    const postedAt =
      job.dateDiscovered && !Number.isNaN(new Date(job.dateDiscovered).getTime())
        ? new Date(job.dateDiscovered)
        : new Date();
    const uj = await prisma.$transaction(async (tx) => {
      const listing = await tx.jobListing.upsert({
        where: { dedupeKey },
        create: {
          title: (job.role ?? "Not yet listed").trim() || "Not yet listed",
          archetype: matchMeta?.archetype ?? null,
          company: job.company,
          sourceUrl: canonical,
          dedupeKey,
          source: job.source || "Upload",
          ctc: job.ctc,
          ctcSource: "MANUAL",
          postedAt,
          description: job.description,
          location: job.location,
          remotePolicy: job.remotePolicy,
          experienceYearsMin: extracted.experienceYearsMin,
          experienceYearsMax: extracted.experienceYearsMax,
          rawPayload: mergedPayload,
        },
        update: {
          title: (job.role ?? "Not yet listed").trim() || "Not yet listed",
          archetype: matchMeta?.archetype ?? null,
          company: job.company,
          sourceUrl: canonical,
          source: job.source || "Upload",
          ctc: job.ctc,
          description: job.description,
          location: job.location,
          remotePolicy: job.remotePolicy,
          experienceYearsMin: extracted.experienceYearsMin,
          experienceYearsMax: extracted.experienceYearsMax,
          rawPayload: mergedPayload,
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
          appliedAt: null,
          saved: true,
        },
        update: { saved: true },
      });

      return tx.userJob.findUnique({
        where: { id: relation.id },
        include: { jobListing: true },
      });
    });
    if (uj) savedJobs.push(toJobDTOFromJoin(uj));

    // Track company career page sources (placeholder rows from uploads) for future alerts.
    const shouldTrackCareerPage =
      (job.role ?? "").trim().toLowerCase() === "not yet listed";
    if (shouldTrackCareerPage) {
      const trackerUrl =
        job.link && URL.canParse(job.link)
          ? canonicalJobUrl(job.link)
          : canonical;
      const existingTracker = await prisma.tracker.findFirst({
        where: { userId, url: trackerUrl },
        select: { id: true },
      });
      if (existingTracker) {
        await prisma.tracker.update({
          where: { id: existingTracker.id },
          data: { active: true, company: job.company },
        });
      } else {
        await prisma.tracker.create({
          data: {
            userId,
            company: job.company,
            url: trackerUrl,
            active: true,
          },
        });
      }
    }
  }

  return {
    ok: true,
    addedCount: savedJobs.length,
    aiConsidered: prefsFiltered.length,
    aiMatched: aiMatchedJobs.length,
    skippedInvalid,
    jobs: savedJobs,
  };
}

export async function importJobsFromUrls(urls: string[]): Promise<ImportUrlsResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Unauthorized." };
  if (!Array.isArray(urls) || urls.length === 0) {
    return { ok: false, error: "Provide at least one URL." };
  }

  const cleaned = urls
    .map((u) => u.trim())
    .filter(Boolean)
    .filter((u) => URL.canParse(u));
  if (cleaned.length === 0) {
    return { ok: false, error: "No valid URLs found." };
  }

  const unique = Array.from(new Set(cleaned)).slice(0, 50);
  const notes: string[] = [];
  const jobs: JobDTO[] = [];
  let skippedCount = 0;

  for (const rawUrl of unique) {
    try {
      const parsed = new URL(rawUrl);
      const greenhouse = await tryGreenhouseApi(parsed);
      const lever = greenhouse ? null : await tryLeverApi(parsed);

      let extracted:
        | { title: string; company: string; location: string | null; description: string | null }
        | null = greenhouse ?? lever;

      if (!extracted) {
        const scraped = await scrapeGenericUrl(rawUrl);
        const ai = await extractJobFromScrapeWithGemini({
          url: rawUrl,
          titleTag: scraped.titleTag,
          metaDescription: scraped.metaDescription,
          metaOgTitle: scraped.metaOgTitle,
          bodyText: scraped.bodyText,
        });
        if (!ai.ok) {
          skippedCount += 1;
          notes.push(`${rawUrl}: ${ai.error.message}`);
          continue;
        }
        extracted = ai.job;
      }

      const canonical = canonicalJobUrl(rawUrl);
      const dedupeKey = jobDedupeKey(rawUrl);
      const uj = await prisma.$transaction(async (tx) => {
        const listing = await tx.jobListing.upsert({
          where: { dedupeKey },
          create: {
            title: extracted.title,
            company: extracted.company,
            sourceUrl: canonical,
            dedupeKey,
            source: "URL Import",
            description: extracted.description,
            location: extracted.location,
            ctcSource: "MANUAL",
            postedAt: new Date(),
          },
          update: {
            title: extracted.title,
            company: extracted.company,
            sourceUrl: canonical,
            source: "URL Import",
            description: extracted.description ?? undefined,
            location: extracted.location ?? undefined,
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
            appliedAt: null,
            saved: true,
          },
          update: { saved: true },
        });
        return tx.userJob.findUnique({
          where: { id: relation.id },
          include: { jobListing: true },
        });
      });
      if (uj) jobs.push(toJobDTOFromJoin(uj));
    } catch (e) {
      skippedCount += 1;
      notes.push(
        `${rawUrl}: ${e instanceof Error ? e.message : "Failed to import URL"}`
      );
    }
  }

  return {
    ok: true,
    addedCount: jobs.length,
    skippedCount,
    jobs,
    notes: notes.slice(0, 25),
  };
}

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
          appliedAt: null,
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
          appliedAt: null,
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
      data: { applied, appliedAt: applied ? new Date() : null },
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
