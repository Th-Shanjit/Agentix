import { notFound } from "next/navigation";
import { loadJobDetail } from "@/actions/job-detail";
import { JobDetailView } from "./JobDetailView";

export default async function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const r = await loadJobDetail(params.id);
  if (!r.ok) {
    if (r.error === "Not found.") notFound();
    notFound();
  }
  return <JobDetailView initial={r.data} jobListingId={params.id} />;
}
