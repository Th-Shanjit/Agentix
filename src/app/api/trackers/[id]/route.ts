import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = context.params;
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
  const update: {
    company?: string;
    url?: string;
    active?: boolean;
  } = {};
  if (typeof data.company === "string") update.company = data.company.trim();
  if (typeof data.url === "string") update.url = data.url.trim();
  if (typeof data.active === "boolean") update.active = data.active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const result = await prisma.tracker.updateMany({
    where: { id, userId },
    data: update,
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const tracker = await prisma.tracker.findUnique({ where: { id } });
  return NextResponse.json(tracker);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = context.params;
  const result = await prisma.tracker.deleteMany({
    where: { id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
