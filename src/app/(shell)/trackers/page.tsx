export default function TrackersPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Trackers
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Manage company URLs for your GitHub Actions scraper. CRUD will land in
          the next iteration.
        </p>
      </header>
    </div>
  );
}
