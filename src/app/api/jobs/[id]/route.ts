import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canonicalJobUrl, jobDedupeKey } from "@/lib/job-url";
import { toJobDTOFromJoin } from "@/lib/jobs";

type RouteContext = { params: { id: string } };

function buildListingPayload(
  body: Record<string, unknown>
): Prisma.JobListingUpdateInput | null {
  const data: Prisma.JobListingUpdateInput = {};

  if (typeof body.company === "string") data.company = body.company.trim();
  if (typeof body.role === "string") data.title = body.role.trim();
  if (typeof body.link === "string") {
    const link = body.link.trim();
    data.sourceUrl = canonicalJobUrl(link);
    data.dedupeKey = jobDedupeKey(link);
  }
  if (typeof body.ctc === "string" || body.ctc === null) {
    data.ctc =
      body.ctc === null
        ? null
        : String(body.ctc).trim() === ""
          ? null
          : String(body.ctc).trim();
  }
  if (typeof body.source === "string") data.source = body.source.trim();
  if (typeof body.dateDiscovered === "string" && body.dateDiscovered) {
    const parsed = new Date(body.dateDiscovered);
    if (!Number.isNaN(parsed.getTime())) {
      data.postedAt = parsed;
    }
  }

  return Object.keys(data).length > 0 ? data : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
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

  const raw = body as Record<string, unknown>;

  const ujByUserJobId = await prisma.userJob.findFirst({
    where: { id, userId },
    include: { jobListing: true },
  });

  const ujByListingId = ujByUserJobId
    ? null
    : await prisma.userJob.findFirst({
        where: { userId, jobListingId: id },
        include: { jobListing: true },
      });

  const uj = ujByUserJobId ?? ujByListingId;
  if (!uj) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const jobListingId = uj.jobListingId;

  if (typeof raw.applied === "boolean") {
    await prisma.userJob.update({
      where: { id: uj.id },
      data: { applied: raw.applied },
    });
  }

  const payload = buildListingPayload(raw);
  if (payload) {
    await prisma.jobListing.update({
      where: { id: jobListingId },
      data: payload,
    });
  }

  if (!payload && typeof raw.applied !== "boolean") {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const next = await prisma.userJob.findUnique({
    where: { id: uj.id },
    include: { jobListing: true },
  });

  return NextResponse.json(next ? toJobDTOFromJoin(next) : null);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobListingId } = context.params;
  if (!jobListingId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const result = await prisma.userJob.deleteMany({
    where: { userId, jobListingId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
