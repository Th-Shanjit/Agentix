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

  const [rows, user] = userId
    ? await Promise.all([
        prisma.userJob.findMany({
          where: { userId, jobListing: { archivedAt: null } },
          include: { jobListing: true },
          orderBy: { jobListing: { postedAt: "desc" } },
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            resumeText: true,
            yearsExperience: true,
            preferredCountries: true,
            preferredRoles: true,
            searchRemotePreference: true,
          },
        }),
      ])
    : [[], null];

  const initialJobs = rows.map(toJobDTOFromJoin);
  const hasResume = Boolean(user?.resumeText?.trim());
  const hasPrefs =
    (typeof user?.yearsExperience === "number" &&
      Number.isFinite(user.yearsExperience)) ||
    (Array.isArray(user?.preferredCountries) &&
      user.preferredCountries.some((x) => typeof x === "string" && x.trim())) ||
    (Array.isArray(user?.preferredRoles) &&
      user.preferredRoles.some((x) => typeof x === "string" && x.trim())) ||
    Boolean(user?.searchRemotePreference);

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
        setup={{
          hasResume,
          hasPrefs,
          hasJobs: initialJobs.length > 0,
        }}
      />
    </div>
  );
}
