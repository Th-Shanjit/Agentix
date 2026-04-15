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
    <div className="relative flex min-h-dvh items-center justify-center bg-shell-bg px-4 py-12">
      <GlassBackground />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="kicker tracking-widest">Agentix</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-foreground-secondary">
            Email and password. Your data is scoped to your account.
          </p>
        </div>

        <div className="card p-6">
          <form
            onSubmit={(e) => void handlePasswordSignIn(e)}
            className="space-y-4"
          >
            <div>
              <label htmlFor="login-email" className="label">
                Email
              </label>
              <input
                id="login-email"
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
              <label htmlFor="login-password" className="label">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mt-1.5"
              />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-foreground-secondary">
            New here?{" "}
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-medium text-primary hover:underline"
            >
              Create an account
            </Link>
          </p>

          {message && (
            <p className="mt-4 text-center text-sm" style={{ color: "var(--callout-error-text)" }}>{message}</p>
          )}
          {!message && authError && (
            <p className="mt-4 text-center text-sm" style={{ color: "var(--callout-error-text)" }}>
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
        <div className="flex min-h-dvh items-center justify-center bg-shell-bg text-sm text-foreground-secondary">
          Loading…
        </div>
      }
    >
      <LoginForm {...props} />
    </Suspense>
  );
}
