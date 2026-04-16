import { DiscoverJobsList } from "@/components/discover/DiscoverJobsList";
import { requireActiveSession } from "@/lib/require-active-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const session = await requireActiveSession("/discover");
  const userId = session?.user?.id;

  const listings = userId
    ? await prisma.jobListing.findMany({
        where: {
          ingestionStatus: "VALIDATED",
          archivedAt: null,
          userJobs: { none: { userId } },
        },
        orderBy: { postedAt: "desc" },
        take: 200,
        select: {
          id: true,
          title: true,
          company: true,
          location: true,
          source: true,
          sourceUrl: true,
          postedAt: true,
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <header className="card p-5">
        <h2 className="section-heading text-2xl">Discover jobs</h2>
        <p className="section-desc mt-1.5 max-w-2xl">
          Browse validated catalog listings and add relevant roles to your
          personal board.
        </p>
      </header>

      <DiscoverJobsList
        initial={listings.map((row) => ({
          ...row,
          postedAt: row.postedAt.toISOString(),
          location: row.location ?? null,
        }))}
      />
    </div>
  );
}

