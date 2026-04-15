import { JobBoard } from "@/components/board/JobBoard";
import { prisma } from "@/lib/prisma";
import { toJobDTOFromJoin } from "@/lib/jobs";
import { requireActiveSession } from "@/lib/require-active-session";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams?: { refresh?: string };
}) {
  const session = await requireActiveSession("/board");
  const userId = session?.user?.id;
  const shouldRefresh = searchParams?.refresh === "1";

  const rows = userId
    ? await prisma.userJob.findMany({
        where: { userId, jobListing: { archivedAt: null } },
        include: { jobListing: true },
        orderBy: { jobListing: { postedAt: "desc" } },
      })
    : [];

  const initialJobs = rows.map(toJobDTOFromJoin);

  return (
    <div className="space-y-6">
      <header className="card p-5">
        <h2 className="section-heading text-2xl">My jobs</h2>
        <p className="section-desc mt-1.5 max-w-2xl">
          Your list. Tap a title for details. Toggle <strong>Applied</strong>{" "}
          when you send an application.
        </p>
      </header>

      <JobBoard
        initialJobs={initialJobs}
        userId={userId ?? ""}
        autoRefreshOnMount={shouldRefresh}
      />
    </div>
  );
}
