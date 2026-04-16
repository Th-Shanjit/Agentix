"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Compass, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/board", label: "My jobs", icon: Briefcase },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface-overlay px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-2xl md:hidden [padding-left:max(0.5rem,env(safe-area-inset-left))] [padding-right:max(0.5rem,env(safe-area-inset-right))]"
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
                  "flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors duration-150 active:scale-[0.97]",
                  active
                    ? "bg-primary-subtle text-primary"
                    : "text-foreground-muted hover:text-foreground"
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
