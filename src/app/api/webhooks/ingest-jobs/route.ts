import { NextResponse } from "next/server";
import { fetchJSearchPage } from "@/lib/jobs-ingest/jsearch";
import { persistNormalizedJobs } from "@/lib/jobs-ingest/persist";

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
 * Protected ingest: pulls from JSearch (RapidAPI) and upserts JobListing rows.
 * Headers: x-agentix-secret or Authorization: Bearer <CRON_WEBHOOK_SECRET>
 * Body JSON optional: { "query": "software engineer india", "page": 1 }
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Ingest webhook is not configured." },
      { status: 503 }
    );
  }

  const provided = getSecret(request);
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    const j = await request.json();
    if (j && typeof j === "object") body = j as Record<string, unknown>;
  } catch {
    /* use defaults */
  }

  const query =
    typeof body.query === "string" && body.query.trim()
      ? body.query.trim()
      : process.env.DEFAULT_INGEST_QUERY?.trim() ||
        "software developer remote";

  const page =
    typeof body.page === "number" && body.page > 0
      ? Math.floor(body.page)
      : 1;

  try {
    const normalized = await fetchJSearchPage({ query, page, numPages: 1 });
    const { inserted, skipped } = await persistNormalizedJobs(normalized);
    return NextResponse.json({
      ok: true,
      query,
      page,
      fetched: normalized.length,
      inserted,
      skipped,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ingest failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
