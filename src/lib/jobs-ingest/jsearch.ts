import type { NormalizedJob } from "./types";

type JSearchRow = {
  job_id?: string;
  employer_name?: string;
  employer_website?: string;
  job_title?: string;
  job_apply_link?: string;
  job_city?: string;
  job_country?: string;
  job_description?: string;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_employment_types?: string | null;
  job_is_remote?: boolean | null;
  job_posted_at_datetime_utc?: string | null;
};

type JSearchResponse = {
  data?: JSearchRow[];
};

function parseRemote(r: JSearchRow): string | null {
  if (r.job_is_remote) return "remote";
  const t = r.job_employment_types?.toLowerCase() ?? "";
  if (t.includes("remote")) return "remote";
  if (t.includes("hybrid")) return "hybrid";
  return null;
}

function locationLine(r: JSearchRow): string | null {
  const parts = [r.job_city, r.job_country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Map one JSearch API row to NormalizedJob. */
export function mapJSearchRow(r: JSearchRow): NormalizedJob {
  const posted = r.job_posted_at_datetime_utc
    ? new Date(r.job_posted_at_datetime_utc)
    : new Date();
  const cur = r.job_salary_currency?.trim() || "USD";
  const cc = r.job_country ? [r.job_country] : null;
  return {
    title: (r.job_title ?? "Role").trim(),
    company: (r.employer_name ?? "Company").trim(),
    applyUrl: (r.job_apply_link ?? "").trim(),
    location: locationLine(r),
    description: r.job_description?.trim() ?? null,
    salaryMin:
      typeof r.job_min_salary === "number" ? Math.round(r.job_min_salary) : null,
    salaryMax:
      typeof r.job_max_salary === "number" ? Math.round(r.job_max_salary) : null,
    salaryCurrency: cur,
    remotePolicy: parseRemote(r),
    countryCodes: cc,
    experienceYearsMin: null,
    experienceYearsMax: null,
    postedAt: Number.isNaN(posted.getTime()) ? new Date() : posted,
    source: "jsearch",
    sourceName: "JSearch",
    externalId: r.job_id ?? null,
    raw: r as unknown as Record<string, unknown>,
  };
}

/**
 * Fetch one page from JSearch (RapidAPI). Requires RAPIDAPI_KEY.
 * @see https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 */
export async function fetchJSearchPage(params: {
  query: string;
  page?: number;
  numPages?: number;
}): Promise<NormalizedJob[]> {
  const key = process.env.RAPIDAPI_KEY?.trim();
  if (!key) {
    console.warn("jobs-ingest: RAPIDAPI_KEY not set; skipping JSearch fetch.");
    return [];
  }

  const host =
    process.env.JSEARCH_RAPIDAPI_HOST?.trim() || "jsearch.p.rapidapi.com";
  const page = params.page ?? 1;
  const numPages = params.numPages ?? 1;
  const q = encodeURIComponent(params.query.trim());

  const url = `https://${host}/search?query=${q}&page=${page}&num_pages=${numPages}`;

  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`JSearch HTTP ${res.status}: ${t.slice(0, 200)}`);
  }

  const json = (await res.json()) as JSearchResponse;
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map(mapJSearchRow).filter((j) => j.applyUrl.startsWith("http"));
}
