"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateSearchPreferences } from "@/actions/user";
import type { RemotePreference } from "@prisma/client";

type ProfileSearchPrefsProps = {
  initialYears: number | null;
  initialCountries: string;
  initialRoles: string;
  initialRemote: RemotePreference;
  initialAlertEmailsEnabled: boolean;
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
  initialRoles,
  initialRemote,
  initialAlertEmailsEnabled,
}: ProfileSearchPrefsProps) {
  const [years, setYears] = useState(
    initialYears != null ? String(initialYears) : ""
  );
  const [countries, setCountries] = useState(initialCountries);
  const [roles, setRoles] = useState(initialRoles);
  const [remote, setRemote] = useState<RemotePreference>(initialRemote);
  const [alertEmailsEnabled, setAlertEmailsEnabled] = useState(
    initialAlertEmailsEnabled
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const y = years.trim() ? parseInt(years, 10) : NaN;
      const r = await updateSearchPreferences({
        yearsExperience: !Number.isNaN(y) ? y : null,
        preferredCountries: countries,
        preferredRoles: roles,
        searchRemotePreference: remote,
        alertEmailsEnabled,
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
        <label className="block text-xs font-medium text-slate-600">
          Preferred roles for alerts (comma-separated)
          <input
            value={roles}
            onChange={(e) => setRoles(e.target.value)}
            placeholder="Associate Product Manager, Junior Product Manager"
            className="mt-1 w-full max-w-lg rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 backdrop-blur-xl"
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Daily email alerts use these roles to detect relevant openings.
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={alertEmailsEnabled}
            onChange={(e) => setAlertEmailsEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-white/60 bg-white/50"
          />
          Enable daily alert emails
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
