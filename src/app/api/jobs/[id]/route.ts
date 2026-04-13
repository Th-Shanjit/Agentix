import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

function buildUpdatePayload(
  body: Record<string, unknown>
): Prisma.JobUpdateManyMutationInput | null {
  const data: Prisma.JobUpdateManyMutationInput = {};

  if (typeof body.company === "string") data.company = body.company.trim();
  if (typeof body.role === "string") data.role = body.role.trim();
  if (typeof body.link === "string") data.link = body.link.trim();
  if (typeof body.ctc === "string" || body.ctc === null) {
    data.ctc =
      body.ctc === null
        ? null
        : String(body.ctc).trim() === ""
          ? null
          : String(body.ctc).trim();
  }
  if (typeof body.source === "string") data.source = body.source.trim();
  if (typeof body.applied === "boolean") data.applied = body.applied;
  if (typeof body.dateDiscovered === "string" && body.dateDiscovered) {
    const parsed = new Date(body.dateDiscovered);
    if (!Number.isNaN(parsed.getTime())) {
      data.dateDiscovered = parsed;
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

  const payload = buildUpdatePayload(body as Record<string, unknown>);
  if (!payload) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const result = await prisma.job.updateMany({
    where: { id, userId },
    data: payload,
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = await prisma.job.findUnique({ where: { id } });
  return NextResponse.json(job);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const result = await prisma.job.deleteMany({
    where: { id, userId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
