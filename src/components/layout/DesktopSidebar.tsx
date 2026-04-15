"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Briefcase, LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { clearActiveSessionCookie } from "@/lib/browser-session";

const nav = [
  { href: "/board", label: "My jobs", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const display =
    session?.user?.name ??
    session?.user?.email ??
    (status === "authenticated" ? "Signed in" : null);

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:gap-2 md:px-4 md:py-6">
      <div className="mb-6 px-2">
        <p className="kicker tracking-widest">Agentix</p>
        <h1 className="mt-1 text-lg font-semibold text-foreground">
          Career hub
        </h1>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors duration-150",
                active
                  ? "border-primary/20 bg-primary-subtle text-foreground"
                  : "border-transparent text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0 opacity-75" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto card space-y-3 p-4 text-xs text-foreground-secondary">
        {status === "loading" && (
          <p className="animate-pulse">Loading session…</p>
        )}
        {status === "authenticated" && display && (
          <>
            <div>
              <p className="kicker">Account</p>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">
                {display}
              </p>
              {session?.user?.email &&
                display &&
                session.user.email !== display && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-foreground-muted">
                    {session.user.email}
                  </p>
                )}
            </div>
            <button
              type="button"
              disabled={signingOut}
              onClick={() => {
                if (signingOut) return;
                setSigningOut(true);
                clearActiveSessionCookie();
                void signOut({ callbackUrl: "/login" }).catch(() =>
                  setSigningOut(false)
                );
              }}
              className="btn-secondary w-full text-xs"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </>
        )}
        {status === "unauthenticated" && (
          <Link href="/login" className="btn-primary w-full text-xs">
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
