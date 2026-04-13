import { auth } from "@/auth";
import { JobBoard } from "@/components/board/JobBoard";
import { prisma } from "@/lib/prisma";
import { toJobDTO } from "@/lib/jobs";

export default async function BoardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const jobs = userId
    ? await prisma.job.findMany({
        where: { userId },
        orderBy: { dateDiscovered: "desc" },
      })
    : [];

  const initialJobs = jobs.map(toJobDTO);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Job board
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Roles scoped to your account. Toggle <strong>Applied</strong> syncs
          instantly with the database via{" "}
          <code className="rounded-md bg-white/50 px-1.5 py-0.5 text-xs">
            PATCH /api/jobs/:id
          </code>
          .
        </p>
      </header>

      <JobBoard initialJobs={initialJobs} />
    </div>
  );
}
