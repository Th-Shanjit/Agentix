import { auth } from "@/auth";
import { JobBoard } from "@/components/board/JobBoard";
import { prisma } from "@/lib/prisma";
import { toJobDTOFromJoin } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams?: { refresh?: string };
}) {
  const session = await auth();
  const userId = session?.user?.id;
  const shouldRefresh = searchParams?.refresh === "1";

  const rows = userId
    ? await prisma.userJob.findMany({
        where: { userId },
        include: { jobListing: true },
        orderBy: { jobListing: { postedAt: "desc" } },
      })
    : [];

  const initialJobs = rows.map(toJobDTOFromJoin);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          My jobs
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
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
