"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateSearchPreferences } from "@/actions/user";
import type { RemotePreference } from "@prisma/client";

type ProfileSearchPrefsProps = {
  initialYears: number | null;
  initialCountries: string;
  initialRemote: RemotePreference;
};

const REMOTE_OPTIONS: { value: RemotePreference; label: string }[] = [
  { value: "ANY", label: "Any" },
  { value: "REMOTE_ONLY", label: "Remote only" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ONSITE", label: "On-site" },
];

export function ProfileSearchPrefs({
  initialYears,
  initialCountries,
  initialRemote,
}: ProfileSearchPrefsProps) {
  const [years, setYears] = useState(
    initialYears != null ? String(initialYears) : ""
  );
  const [countries, setCountries] = useState(initialCountries);
  const [remote, setRemote] = useState<RemotePreference>(initialRemote);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const y = years.trim() ? parseInt(years, 10) : NaN;
      const r = await updateSearchPreferences({
        yearsExperience: !Number.isNaN(y) ? y : null,
        preferredCountries: countries,
        searchRemotePreference: remote,
      });
      if (!r.ok) throw new Error(r.error);
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl">
      <h3 className="text-lg font-semibold text-slate-900">Job preferences</h3>
      <p className="mt-1 text-sm text-slate-600">
        Preferences used when AI filters and tidies imported jobs.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          Years of experience
          <input
            inputMode="numeric"
            value={years}
            onChange={(e) => setYears(e.target.value)}
            placeholder="e.g. 5"
            className="mt-1 w-full max-w-xs rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Preferred countries (comma-separated)
          <input
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            placeholder="India, Germany"
            className="mt-1 w-full max-w-lg rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Work mode
          <select
            value={remote}
            onChange={(e) =>
              setRemote(e.target.value as RemotePreference)
            }
            className="mt-1 block w-full max-w-xs rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
          >
            {REMOTE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full border border-sky-400/50 bg-sky-500/90 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </form>
    </section>
  );
}
