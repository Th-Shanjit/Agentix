"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { registerWithEmailPassword } from "@/actions/auth-register";
import { GlassBackground } from "@/components/layout/GlassBackground";
import { setActiveSessionCookie } from "@/lib/browser-session";

export function RegisterClient({ defaultCallbackUrl }: { defaultCallbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const r = await registerWithEmailPassword(email, password);
      if (!r.ok) {
        setMessage(r.error);
        setBusy(false);
        return;
      }
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setMessage("Sign-in failed after registration. Please try logging in.");
        setBusy(false);
        return;
      }
      if (res?.ok) {
        setActiveSessionCookie();
        window.location.href = defaultCallbackUrl;
        return;
      }
      setMessage("Sign-in failed after registration. Please try logging in.");
      setBusy(false);
    } catch {
      setMessage("Something went wrong. Try again.");
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
            Create account
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Email and password. Your jobs and profile are tied to this account.
          </p>
        </div>

        <div className="rounded-3xl border border-white/15 bg-[#19181A]/75 p-6 shadow-glass backdrop-blur-2xl transition-all duration-300">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
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
              Password (min 8 characters)
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-full border border-white/20 bg-white/10 px-4 py-3 text-base text-slate-100 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-[#A16E83]/80"
              />
            </label>
            <label className="block text-xs font-medium text-slate-300">
              Confirm password
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-full border border-white/20 bg-white/10 px-4 py-3 text-base text-slate-100 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-[#A16E83]/80"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 min-h-[48px] w-full rounded-full border border-[#479761]/40 bg-[#479761]/90 py-3 text-base font-semibold text-white shadow-md backdrop-blur-xl transition-all duration-300 hover:bg-[#3d8254] active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>

          {message && (
            <p className="mt-4 text-center text-sm text-red-400">{message}</p>
          )}

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-[#A16E83] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
