import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trackers = await prisma.tracker.findMany({
    where: { userId },
    orderBy: { company: "asc" },
  });
  return NextResponse.json(trackers);
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
  const url = typeof data.url === "string" ? data.url.trim() : "";
  const active =
    typeof data.active === "boolean" ? data.active : true;

  if (!company || !url) {
    return NextResponse.json(
      { error: "company and url are required" },
      { status: 400 }
    );
  }

  const tracker = await prisma.tracker.create({
    data: { userId, company, url, active },
  });
  return NextResponse.json(tracker, { status: 201 });
}
