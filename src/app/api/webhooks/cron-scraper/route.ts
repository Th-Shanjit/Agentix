import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalJobUrl, jobDedupeKey } from "@/lib/job-url";

/** Hard cap per request to limit accidental or abusive large payloads. */
const MAX_JOBS_PER_REQUEST = 100;

export const maxDuration = 60;

type IncomingJob = {
  company: string;
  role: string;
  link: string;
  ctc?: string | null;
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

/**
 * GitHub Actions (or any cron) posts scraped jobs here.
 * Header: x-agentix-secret or Authorization: Bearer <CRON_WEBHOOK_SECRET>
 * Body: { "userId": string, "jobs": [{ company, role, link, ctc? }] }
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Cron webhook is not configured on the server." },
      { status: 503 }
    );
  }

  const provided = getSecret(request);
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  const jobsRaw = data.jobs;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (!Array.isArray(jobsRaw) || jobsRaw.length === 0) {
    return NextResponse.json(
      { error: "jobs must be a non-empty array" },
      { status: 400 }
    );
  }

  if (jobsRaw.length > MAX_JOBS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Too many jobs in one request (max ${MAX_JOBS_PER_REQUEST}).`,
      },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const jobs: IncomingJob[] = [];
  for (const item of jobsRaw) {
    if (!item || typeof item !== "object") continue;
    const j = item as Record<string, unknown>;
    const company = typeof j.company === "string" ? j.company.trim() : "";
    const role = typeof j.role === "string" ? j.role.trim() : "";
    const link = typeof j.link === "string" ? j.link.trim() : "";
    if (!company || !role || !link) continue;
    const ctc =
      j.ctc === null || j.ctc === undefined
        ? null
        : typeof j.ctc === "string"
          ? j.ctc.trim() || null
          : null;
    jobs.push({ company, role, link, ctc });
  }

  if (jobs.length === 0) {
    return NextResponse.json(
      { error: "No valid jobs in payload" },
      { status: 400 }
    );
  }

  let inserted = 0;
  for (const j of jobs) {
    const canonical = canonicalJobUrl(j.link);
    const dedupeKey = jobDedupeKey(j.link);
    const listing = await prisma.jobListing.upsert({
      where: { dedupeKey },
      create: {
        title: j.role,
        company: j.company,
        sourceUrl: canonical,
        dedupeKey,
        ctc: j.ctc,
        source: "Tracker",
        postedAt: new Date(),
      },
      update: {
        title: j.role,
        company: j.company,
        ctc: j.ctc ?? undefined,
        sourceUrl: canonical,
      },
    });

    await prisma.userJob.upsert({
      where: {
        userId_jobListingId: { userId, jobListingId: listing.id },
      },
      create: {
        userId,
        jobListingId: listing.id,
        applied: false,
        saved: true,
      },
      update: {},
    });
    inserted += 1;
  }

  return NextResponse.json({ inserted });
}
