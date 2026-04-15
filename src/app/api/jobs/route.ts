import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canonicalJobUrl, jobDedupeKey } from "@/lib/job-url";
import { toJobDTOFromJoin } from "@/lib/jobs";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.userJob.findMany({
    where: { userId, jobListing: { archivedAt: null } },
    include: { jobListing: true },
    orderBy: { jobListing: { postedAt: "desc" } },
  });

  return NextResponse.json(rows.map((r) => toJobDTOFromJoin(r)));
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const company = typeof data.company === "string" ? data.company.trim() : "";
  const role = typeof data.role === "string" ? data.role.trim() : "";
  const link = typeof data.link === "string" ? data.link.trim() : "";
  const source =
    typeof data.source === "string" && data.source.trim()
      ? data.source.trim()
      : "Manual";

  if (!company || !role || !link) {
    return NextResponse.json(
      { error: "company, role, and link are required" },
      { status: 400 }
    );
  }

  const ctc =
    typeof data.ctc === "string" && data.ctc.trim() ? data.ctc.trim() : null;
  const applied = typeof data.applied === "boolean" ? data.applied : false;

  let postedAt = new Date();
  if (typeof data.dateDiscovered === "string" && data.dateDiscovered) {
    const parsed = new Date(data.dateDiscovered);
    if (!Number.isNaN(parsed.getTime())) {
      postedAt = parsed;
    }
  }

  const canonical = canonicalJobUrl(link);
  const dedupeKey = jobDedupeKey(link);

  const listing = await prisma.jobListing.upsert({
    where: { dedupeKey },
    create: {
      title: role,
      company,
      sourceUrl: canonical,
      dedupeKey,
      ctc,
      ctcSource: "MANUAL",
      source,
      postedAt,
    },
    update: {
      title: role,
      company,
      ctc,
      source,
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
      applied,
      appliedAt: applied ? new Date() : null,
      saved: true,
    },
    update: { applied, appliedAt: applied ? new Date() : null },
  });

  const uj = await prisma.userJob.findUnique({
    where: {
      userId_jobListingId: { userId, jobListingId: listing.id },
    },
    include: { jobListing: true },
  });

  if (!uj) {
    return NextResponse.json({ error: "Could not load job" }, { status: 500 });
  }

  return NextResponse.json(toJobDTOFromJoin(uj), { status: 201 });
}
