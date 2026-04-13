import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ResumeUpload } from "@/components/profile/ResumeUpload";
import { ProfileSearchPrefs } from "@/components/profile/ProfileSearchPrefs";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const session = await auth();

  let initialResumeText: string | null = null;
  let yearsExperience: number | null = null;
  let preferredCountriesStr = "";
  let searchRemote: "ANY" | "REMOTE_ONLY" | "HYBRID" | "ONSITE" = "ANY";

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        resumeText: true,
        yearsExperience: true,
        preferredCountries: true,
        searchRemotePreference: true,
      },
    });
    initialResumeText = user?.resumeText ?? null;
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
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Résumé
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          PDF → text in your browser. We use it for Search match scores and job
          pages.
        </p>
        {session?.user && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/50 pt-4 text-sm text-slate-700">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Signed in as
              </p>
              <p className="font-medium text-slate-900">
                {session.user.name ?? session.user.email ?? session.user.id}
              </p>
              {session.user.name && session.user.email && (
                <p className="text-slate-600">{session.user.email}</p>
              )}
            </div>
            <SignOutButton />
          </div>
        )}
      </header>

      <ResumeUpload initialResumeText={initialResumeText} />

      {session?.user?.id && (
        <ProfileSearchPrefs
          initialYears={yearsExperience}
          initialCountries={preferredCountriesStr}
          initialRemote={searchRemote}
        />
      )}
    </div>
  );
}
