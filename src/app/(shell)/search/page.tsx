import { SearchPanel } from "@/components/search/SearchPanel";

export default function SearchPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Search
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Filter roles from your ingested catalog. Use{" "}
          <strong>AI match</strong> for fit scores (needs résumé on Profile).
        </p>
      </header>
      <SearchPanel />
    </div>
  );
}
