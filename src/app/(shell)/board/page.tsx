import type { JobListing, UserJob } from "@prisma/client";
import { auth } from "@/auth";
import { JobBoard } from "@/components/board/JobBoard";
import { prisma } from "@/lib/prisma";
import { toJobDTOFromJoin } from "@/lib/jobs";

type UserJobWithListing = UserJob & { jobListing: JobListing };

export default async function BoardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  // #region agent log
  fetch("http://127.0.0.1:7789/ingest/469f7bf6-046a-4f8e-b523-c0b19a42773e", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "9c4d2d",
    },
    body: JSON.stringify({
      sessionId: "9c4d2d",
      hypothesisId: "H1",
      location: "board/page.tsx:beforeFindMany",
      message: "BoardPage entering userJob.findMany",
      data: { hasUserId: Boolean(userId) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  let rows: UserJobWithListing[] = [];
  if (userId) {
    try {
      rows = await prisma.userJob.findMany({
        where: { userId },
        include: { jobListing: true },
        orderBy: { jobListing: { postedAt: "desc" } },
      });
      // #region agent log
      fetch("http://127.0.0.1:7789/ingest/469f7bf6-046a-4f8e-b523-c0b19a42773e", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "9c4d2d",
        },
        body: JSON.stringify({
          sessionId: "9c4d2d",
          hypothesisId: "H1",
          location: "board/page.tsx:afterFindMany",
          message: "userJob.findMany ok",
          data: { rowCount: rows.length },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch (e) {
      const err = e as { code?: string; meta?: unknown };
      // #region agent log
      fetch("http://127.0.0.1:7789/ingest/469f7bf6-046a-4f8e-b523-c0b19a42773e", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "9c4d2d",
        },
        body: JSON.stringify({
          sessionId: "9c4d2d",
          hypothesisId: "H1",
          location: "board/page.tsx:findManyError",
          message: "userJob.findMany failed",
          data: {
            prismaCode: err.code ?? "unknown",
            name: e instanceof Error ? e.name : "non-Error",
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw e;
    }
  }

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

      <JobBoard initialJobs={initialJobs} userId={userId ?? ""} />
    </div>
  );
}
