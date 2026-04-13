import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.job.findMany({
    where: { userId },
    orderBy: { dateDiscovered: "desc" },
  });

  return NextResponse.json(jobs);
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

  let dateDiscovered = new Date();
  if (typeof data.dateDiscovered === "string" && data.dateDiscovered) {
    const parsed = new Date(data.dateDiscovered);
    if (!Number.isNaN(parsed.getTime())) {
      dateDiscovered = parsed;
    }
  }

  const job = await prisma.job.create({
    data: {
      userId,
      company,
      role,
      link,
      ctc,
      applied,
      source,
      dateDiscovered,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
