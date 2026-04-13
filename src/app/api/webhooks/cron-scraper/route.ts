import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  await prisma.job.createMany({
    data: jobs.map((j) => ({
      userId,
      company: j.company,
      role: j.role,
      link: j.link,
      ctc: j.ctc,
      applied: false,
      source: "Tracker",
    })),
  });

  return NextResponse.json({ inserted: jobs.length });
}
