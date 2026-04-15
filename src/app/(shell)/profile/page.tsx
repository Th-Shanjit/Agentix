import { SignOutButton } from "@/components/auth/SignOutButton";
import { ResumeUpload } from "@/components/profile/ResumeUpload";
import { ProfileSearchPrefs } from "@/components/profile/ProfileSearchPrefs";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/require-active-session";

export default async function ProfilePage() {
  const session = await requireActiveSession("/profile");

  let initialResumeText: string | null = null;
  let initialBragSheet: string | null = null;
  let yearsExperience: number | null = null;
  let preferredCountriesStr = "";
  let preferredRolesStr = "";
  let searchRemote: "ANY" | "REMOTE_ONLY" | "HYBRID" | "ONSITE" = "ANY";
  let alertEmailsEnabled = true;

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        resumeText: true,
        bragSheet: true,
        yearsExperience: true,
        preferredCountries: true,
        preferredRoles: true,
        searchRemotePreference: true,
        alertEmailsEnabled: true,
      },
    });
    initialResumeText = user?.resumeText ?? null;
    initialBragSheet = user?.bragSheet ?? null;
    yearsExperience = user?.yearsExperience ?? null;
    const pc = user?.preferredCountries;
    if (Array.isArray(pc)) {
      preferredCountriesStr = pc
        .filter((x): x is string => typeof x === "string")
        .join(", ");
    }
    if (user?.searchRemotePreference) {
      searchRemote = user.searchRemotePreference;
    }
    const pr = user?.preferredRoles;
    if (Array.isArray(pr)) {
      preferredRolesStr = pr
        .filter((x): x is string => typeof x === "string")
        .join(", ");
    }
    alertEmailsEnabled = user?.alertEmailsEnabled ?? true;
  }

  return (
    <div className="space-y-6">
      <header className="card p-5">
        <h2 className="section-heading text-2xl">Resume</h2>
        <p className="section-desc mt-1.5 max-w-2xl">
          PDF to text in your browser. We use it for Search match scores and job
          pages.
        </p>
        {session?.user && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm text-foreground-secondary">
            <div>
              <p className="label">Signed in as</p>
              <p className="mt-0.5 font-medium text-foreground">
                {session.user.name ?? session.user.email ?? session.user.id}
              </p>
              {session.user.name && session.user.email && (
                <p className="text-foreground-muted">{session.user.email}</p>
              )}
            </div>
            <SignOutButton />
          </div>
        )}
      </header>

      <ResumeUpload
        initialResumeText={initialResumeText}
        initialBragSheet={initialBragSheet}
      />

      {session?.user?.id && (
        <ProfileSearchPrefs
          initialYears={yearsExperience}
          initialCountries={preferredCountriesStr}
          initialRoles={preferredRolesStr}
          initialRemote={searchRemote}
          initialAlertEmailsEnabled={alertEmailsEnabled}
        />
      )}
    </div>
  );
}
