import { auth } from "@/auth";
import { TrackersPanel } from "@/components/trackers/TrackersPanel";
import { prisma } from "@/lib/prisma";

export default async function TrackersPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const initialTrackers = userId
    ? await prisma.tracker.findMany({
        where: { userId },
        orderBy: { company: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Job sources
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Company career pages your automation watches. When your cron hits the
          webhook, new roles can appear under{" "}
          <strong>My jobs</strong> with source{" "}
          <code className="rounded-md bg-white/50 px-1.5 py-0.5 text-xs">
            Tracker
          </code>
          .
        </p>
      </header>
      <TrackersPanel initialTrackers={initialTrackers} />
    </div>
  );
}
