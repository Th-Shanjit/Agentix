"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { registerWithEmailPassword } from "@/actions/auth-register";
import { GlassBackground } from "@/components/layout/GlassBackground";
import { setActiveSessionCookie } from "@/lib/browser-session";

export function RegisterClient({
  defaultCallbackUrl,
}: {
  defaultCallbackUrl: string;
}) {
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
    <div className="relative flex min-h-dvh items-center justify-center bg-shell-bg px-4 py-12">
      <GlassBackground />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="kicker tracking-widest">Agentix</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Create account
          </h1>
          <p className="mt-2 text-sm text-foreground-secondary">
            Email and password. Your jobs and profile are tied to this account.
          </p>
        </div>

        <div className="card p-6">
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-4"
          >
            <div>
              <label htmlFor="reg-email" className="label">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input mt-1.5"
              />
            </div>
            <div>
              <label htmlFor="reg-password" className="label">
                Password (min 8 characters)
              </label>
              <input
                id="reg-password"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mt-1.5"
              />
            </div>
            <div>
              <label htmlFor="reg-confirm" className="label">
                Confirm password
              </label>
              <input
                id="reg-confirm"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input mt-1.5"
              />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>

          {message && (
            <p className="mt-4 text-center text-sm" style={{ color: "var(--callout-error-text)" }}>{message}</p>
          )}

          <p className="mt-5 text-center text-sm text-foreground-secondary">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
