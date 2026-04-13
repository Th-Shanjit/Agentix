import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const salaryMin = parseInt(searchParams.get("salaryMin") ?? "", 10);
  const salaryMax = parseInt(searchParams.get("salaryMax") ?? "", 10);
  const expMin = parseInt(searchParams.get("expMin") ?? "", 10);
  const expMax = parseInt(searchParams.get("expMax") ?? "", 10);
  const remoteOnly = searchParams.get("remoteOnly") === "1";
  const country = (searchParams.get("country") ?? "").trim();
  const sort = searchParams.get("sort") ?? "recent";

  const andParts: Prisma.JobListingWhereInput[] = [];

  const where: Prisma.JobListingWhereInput = {
    ingestionStatus: "VALIDATED",
  };

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  if (remoteOnly) {
    andParts.push({
      remotePolicy: { contains: "remote", mode: "insensitive" },
    });
  }

  if (country) {
    andParts.push({
      OR: [
        { location: { contains: country, mode: "insensitive" } },
        { description: { contains: country, mode: "insensitive" } },
      ],
    });
  }

  if (!Number.isNaN(expMin) && expMin > 0) {
    andParts.push({
      OR: [
        { experienceYearsMax: { gte: expMin } },
        { experienceYearsMax: null },
      ],
    });
  }

  if (!Number.isNaN(expMax) && expMax > 0) {
    andParts.push({
      OR: [
        { experienceYearsMin: { lte: expMax } },
        { experienceYearsMin: null },
      ],
    });
  }

  if (!Number.isNaN(salaryMin) && salaryMin > 0) {
    andParts.push({
      OR: [{ salaryMax: { gte: salaryMin } }, { salaryMax: null }],
    });
  }

  if (!Number.isNaN(salaryMax) && salaryMax > 0) {
    andParts.push({
      OR: [{ salaryMin: { lte: salaryMax } }, { salaryMin: null }],
    });
  }

  if (andParts.length) {
    where.AND = andParts;
  }

  const listings = await prisma.jobListing.findMany({
    where,
    orderBy: { postedAt: "desc" },
    take: 100,
    include: {
      matchCaches: {
        where: { userId },
        take: 1,
      },
    },
  });

  const jobs = listings.map((jl) => {
    const mc = jl.matchCaches[0];
    return {
      id: jl.id,
      company: jl.company,
      role: jl.title,
      location: jl.location,
      ctc: jl.ctc,
      link: jl.sourceUrl,
      postedAt: jl.postedAt.toISOString(),
      source: jl.source,
      remotePolicy: jl.remotePolicy,
      salaryMin: jl.salaryMin,
      salaryMax: jl.salaryMax,
      description: jl.description
        ? jl.description.length > 280
          ? jl.description.slice(0, 280) + "…"
          : jl.description
        : null,
      match: mc
        ? {
            fitScore: mc.fitScore,
            upsideScore: mc.upsideScore,
            relevanceScore: mc.relevanceScore,
            strengths: mc.strengths,
            weaknesses: mc.weaknesses,
          }
        : null,
    };
  });

  let ordered = jobs;
  if (sort === "relevance") {
    ordered = [...jobs].sort((a, b) => {
      const ra = a.match?.relevanceScore ?? -1;
      const rb = b.match?.relevanceScore ?? -1;
      if (rb !== ra) return rb - ra;
      return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    });
  }

  return NextResponse.json({ jobs: ordered });
}
