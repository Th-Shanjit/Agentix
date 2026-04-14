"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Briefcase, LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/board", label: "My jobs", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const display =
    session?.user?.name ??
    session?.user?.email ??
    (status === "authenticated" ? "Signed in" : null);

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:gap-2 md:px-4 md:py-6">
      <div className="mb-6 px-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Agentix
        </p>
        <h1 className="mt-1 text-lg font-semibold text-slate-100">Career hub</h1>
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
                "flex items-center gap-3 rounded-full border px-4 py-3 text-sm font-medium transition-all duration-300",
                active
                  ? "border-white/20 bg-white/10 text-slate-100 shadow-glass backdrop-blur-2xl"
                  : "border-transparent bg-white/5 text-slate-300 backdrop-blur-xl hover:border-white/20 hover:bg-white/10 hover:text-slate-100"
              )}
            >
              <Icon className="h-5 w-5 shrink-0 opacity-80" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-xs text-slate-300 shadow-glass backdrop-blur-2xl">
        {status === "loading" && <p className="animate-pulse">Loading session…</p>}
        {status === "authenticated" && display && (
          <>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Account
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-100">
                {display}
              </p>
              {session?.user?.email && session?.user?.name && (
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                  {session.user.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 py-2 text-xs font-semibold text-slate-100 backdrop-blur-xl transition-all duration-300 hover:bg-white/20"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              Sign out
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
