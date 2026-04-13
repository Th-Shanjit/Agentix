import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default async function ProfilePage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Profile & resume
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Client-side PDF parsing with pdfjs-dist will live here. Text stays in
          the browser only.
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
    </div>
  );
}
