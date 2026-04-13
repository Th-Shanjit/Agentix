"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Radar, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/board", label: "Board", icon: Briefcase },
  { href: "/trackers", label: "Trackers", icon: Radar },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/60 bg-white/40 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-glass backdrop-blur-2xl md:hidden"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around gap-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-all duration-300",
                  active
                    ? "bg-white/55 text-slate-900 shadow-sm"
                    : "text-slate-600 hover:bg-white/40 hover:text-slate-900"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
