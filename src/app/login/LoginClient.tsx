"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { GlassBackground } from "@/components/layout/GlassBackground";
import { setActiveSessionCookie } from "@/lib/browser-session";

type LoginClientProps = {
  defaultCallbackUrl: string;
};

function LoginForm({ defaultCallbackUrl }: LoginClientProps) {
  const searchParams = useSearchParams();
  const callbackRaw = searchParams.get("callbackUrl");
  const callbackUrl =
    callbackRaw && callbackRaw.startsWith("/") ? callbackRaw : defaultCallbackUrl;
  const authError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setMessage("Invalid email or password.");
        setBusy(false);
        return;
      }
      if (res?.ok) {
        setActiveSessionCookie();
        window.location.href = callbackUrl;
        return;
      }
      setMessage("Sign-in failed. Try again.");
      setBusy(false);
    } catch {
      setMessage("Sign-in failed. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-[var(--shell-bg)] px-4 py-12">
      <GlassBackground />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Agentix
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Email and password. Your data is scoped to your account.
          </p>
        </div>

        <div className="rounded-3xl border border-white/15 bg-[#19181A]/75 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
          <form onSubmit={(e) => void handlePasswordSignIn(e)} className="space-y-3">
            <label className="block text-xs font-medium text-slate-300">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-1 w-full rounded-full border border-white/20 bg-white/10 px-4 py-3 text-base text-slate-100 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-[#A16E83]/80"
              />
            </label>
            <label className="block text-xs font-medium text-slate-300">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-full border border-white/20 bg-white/10 px-4 py-3 text-base text-slate-100 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-[#A16E83]/80"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[48px] w-full rounded-full border border-[#479761]/40 bg-[#479761]/90 py-3 text-base font-semibold text-white shadow-md backdrop-blur-xl transition-all duration-300 hover:bg-[#3d8254] active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-400">
            New here?{" "}
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-semibold text-[#A16E83] hover:underline"
            >
              Create an account
            </Link>
          </p>

          {message && (
            <p className="mt-4 text-center text-sm text-red-400">{message}</p>
          )}
          {!message && authError && (
            <p className="mt-4 text-center text-sm text-red-400">
              Sign-in failed ({authError}). Please try again.
            </p>
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
        <div className="flex min-h-dvh items-center justify-center bg-[var(--shell-bg)] text-sm text-slate-300">
          Loading…
        </div>
      }
    >
      <LoginForm {...props} />
    </Suspense>
  );
}
