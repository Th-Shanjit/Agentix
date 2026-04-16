import { notFound } from "next/navigation";
import { loadJobDetail } from "@/actions/job-detail";
import { JobDetailView } from "./JobDetailView";
import { requireActiveSession } from "@/lib/require-active-session";
import { JobDetailErrorView } from "./JobDetailErrorView";

export default async function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireActiveSession(`/jobs/${params.id}`);
  const r = await loadJobDetail(params.id);
  if (!r.ok) {
    if (r.error === "Not found.") notFound();
    return <JobDetailErrorView jobId={params.id} message={r.error} />;
  }
  return <JobDetailView initial={r.data} jobListingId={params.id} />;
}
