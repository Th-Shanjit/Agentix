"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateSearchPreferences } from "@/actions/user";
import type { RemotePreference } from "@prisma/client";
import { track } from "@vercel/analytics";

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
      track("profile_prefs_saved", {
        hasYears: !Number.isNaN(y),
        hasCountries: Boolean(countries.trim()),
        hasRoles: Boolean(roles.trim()),
        remote,
        alertEmailsEnabled,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h3 className="section-heading">Job preferences</h3>
      <p className="section-desc mt-1">
        Preferences used when AI filters and tidies imported jobs.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="pref-years" className="label">
            Years of experience
          </label>
          <input
            id="pref-years"
            inputMode="numeric"
            value={years}
            onChange={(e) => setYears(e.target.value)}
            placeholder="e.g. 5"
            className="input mt-1.5 max-w-xs"
          />
        </div>
        <div>
          <label htmlFor="pref-countries" className="label">
            Preferred countries (comma-separated)
          </label>
          <input
            id="pref-countries"
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            placeholder="India, Germany"
            className="input mt-1.5 max-w-lg"
          />
        </div>
        <div>
          <label htmlFor="pref-remote" className="label">
            Work mode
          </label>
          <select
            id="pref-remote"
            value={remote}
            onChange={(e) => setRemote(e.target.value as RemotePreference)}
            className="input mt-1.5 max-w-xs"
          >
            {REMOTE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pref-roles" className="label">
            Preferred roles for alerts (comma-separated)
          </label>
          <input
            id="pref-roles"
            value={roles}
            onChange={(e) => setRoles(e.target.value)}
            placeholder="Associate Product Manager, Junior Product Manager"
            className="input mt-1.5 max-w-lg"
          />
          <span className="mt-1.5 block text-xs text-foreground-muted">
            Daily email alerts use these roles to detect relevant openings.
          </span>
        </div>
        <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium text-foreground-secondary">
          <input
            type="checkbox"
            checked={alertEmailsEnabled}
            onChange={(e) => setAlertEmailsEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Enable daily alert emails
        </label>
        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full sm:w-auto"
        >
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </form>
    </section>
  );
}
