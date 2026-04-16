"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { track } from "@vercel/analytics";
import { saveJobToMyList } from "@/actions/jobs";

type DiscoverListing = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  source: string;
  sourceUrl: string;
  postedAt: string;
};

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DiscoverJobsList({ initial }: { initial: DiscoverListing[] }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initial;
    return initial.filter((job) => {
      const hay =
        `${job.title} ${job.company} ${job.location ?? ""} ${job.source}`.toLowerCase();
      return hay.includes(q);
    });
  }, [initial, query]);

  useEffect(() => {
    track("discover_viewed");
  }, []);

  return (
    <section className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
          strokeWidth={1.75}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by role, company, location, source..."
          className="input pl-9"
        />
      </div>

      <p className="text-xs text-foreground-muted">
        {filtered.length} listing{filtered.length === 1 ? "" : "s"} found
      </p>

      {filtered.length === 0 ? (
        <div className="card border-dashed p-8 text-center">
          <p className="text-sm text-foreground-secondary">
            No listings matched your search.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((job) => {
            const rowBusy = Boolean(busy[job.id]);
            const rowAdded = added.has(job.id);
            return (
              <li key={job.id} className="card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-base font-semibold text-foreground">
                      {job.title}
                    </h3>
                    <p className="flex items-center gap-2 text-sm text-foreground-secondary">
                      <Building2 className="h-4 w-4 shrink-0 opacity-60" strokeWidth={1.75} />
                      {job.company}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={1.75} />
                        {job.location || "Location not listed"}
                      </span>
                      <span>Source: {job.source}</span>
                      <span>Posted: {formatDate(job.postedAt)}</span>
                    </p>
                  </div>

                  <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary w-full text-xs sm:w-auto"
                    >
                      View posting
                    </a>
                    <button
                      type="button"
                      disabled={rowBusy || rowAdded}
                      className="btn-primary w-full text-xs sm:w-auto"
                      onClick={async () => {
                        setBusy((m) => ({ ...m, [job.id]: true }));
                        track("discover_add_started");
                        try {
                          const r = await saveJobToMyList(job.id);
                          if (!r.ok) {
                            toast.error(r.error);
                            track("discover_add_failed");
                            return;
                          }
                          setAdded((prev) => new Set(prev).add(job.id));
                          toast.success("Added to My jobs.");
                          track("discover_add_succeeded");
                        } finally {
                          setBusy((m) => ({ ...m, [job.id]: false }));
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {rowAdded ? "Added" : rowBusy ? "Adding..." : "Add to My jobs"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

