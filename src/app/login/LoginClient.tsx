"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { GlassBackground } from "@/components/layout/GlassBackground";

type LoginClientProps = {
  googleEnabled: boolean;
  emailEnabled: boolean;
};

function LoginForm({ googleEnabled, emailEnabled }: LoginClientProps) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/board";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const noProviders = !googleEnabled && !emailEnabled;

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await signIn("nodemailer", {
        email,
        callbackUrl,
        redirect: true,
      });
    } catch {
      setMessage("Could not send sign-in email. Check server logs and SMTP.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-[#e0e5ec] px-4 py-12">
      <GlassBackground />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Agentix
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Google or email link. Your data stays on your account.
          </p>
        </div>

        <div className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
          {noProviders && (
            <p className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 backdrop-blur-sm">
              No auth providers are configured. Set{" "}
              <code className="rounded bg-white/60 px-1">GOOGLE_CLIENT_ID</code>{" "}
              and{" "}
              <code className="rounded bg-white/60 px-1">
                GOOGLE_CLIENT_SECRET
              </code>{" "}
              (and optional{" "}
              <code className="rounded bg-white/60 px-1">EMAIL_SERVER</code> /{" "}
              <code className="rounded bg-white/60 px-1">EMAIL_FROM</code>) in{" "}
              <code className="rounded bg-white/60 px-1">.env.local</code>{" "}
              (local) or your host env, then restart the dev server.
            </p>
          )}

          {googleEnabled && (
            <button
              type="button"
              disabled={busy}
              onClick={() => signIn("google", { callbackUrl })}
              className="mt-4 flex w-full items-center justify-center rounded-full border border-white/60 bg-white/50 py-3 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-xl transition-all duration-300 hover:bg-white/70 disabled:opacity-60"
            >
              Continue with Google
            </button>
          )}

          {emailEnabled && (
            <form onSubmit={handleMagicLink} className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                Email magic link
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="mt-1 w-full rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-sm text-slate-900 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-violet-300/80"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full border border-violet-400/40 bg-violet-500/90 py-3 text-sm font-semibold text-white shadow-md backdrop-blur-xl transition-all duration-300 hover:bg-violet-600 disabled:opacity-60"
              >
                {busy ? "Sending link…" : "Email me a link"}
              </button>
            </form>
          )}

          {message && (
            <p className="mt-4 text-center text-sm text-red-600">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function LoginClient(props: LoginClientProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#e0e5ec] text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <LoginForm {...props} />
    </Suspense>
  );
}
