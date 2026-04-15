"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowDown, ArrowUp, LogIn, LogOut, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "@/components/providers/ThemeProvider";
import { clearActiveSessionCookie } from "@/lib/browser-session";

const fab =
  "pointer-events-auto inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium shadow-card backdrop-blur-xl transition-colors duration-150 active:scale-[0.97]";
const fabSecondary = cn(fab, "border-border bg-surface-overlay text-foreground");
const fabPrimary = cn(fab, "border-transparent bg-primary text-primary-foreground");

export function TopActions() {
  const { status } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [scrollMetrics, setScrollMetrics] = useState({
    docHeight: 0,
    viewport: 0,
  });
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const measure = () => {
      setScrollMetrics({
        docHeight: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
      });
    };

    const onScroll = () => {
      measure();
      setScrollY(window.scrollY);
      setIsScrolling(true);
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
      }
      hideTimer.current = window.setTimeout(() => {
        setIsScrolling(false);
      }, 900);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    measure();
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
      }
    };
  }, []);

  const midpoint = Math.max(
    0,
    (scrollMetrics.docHeight - scrollMetrics.viewport) / 2
  );
  const goTop = scrollY > midpoint;

  function jump() {
    if (goTop) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: scrollMetrics.docHeight, behavior: "smooth" });
  }

  return (
    <div className="pointer-events-none fixed right-3 top-[max(0.5rem,env(safe-area-inset-top))] z-[70] flex flex-col items-end gap-1.5 md:right-4">
      {status === "authenticated" && (
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
          className={cn(
            fabSecondary,
            "disabled:cursor-wait disabled:opacity-70"
          )}
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
          {signingOut ? "…" : "Sign out"}
        </button>
      )}
      {status === "unauthenticated" && (
        <Link href="/login" className={fabPrimary}>
          <LogIn className="h-3.5 w-3.5" strokeWidth={1.75} />
          Sign in
        </Link>
      )}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={
          theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
        className={fabSecondary}
      >
        {theme === "dark" ? (
          <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
        ) : (
          <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      <button
        type="button"
        onClick={jump}
        aria-label={goTop ? "Scroll to top" : "Scroll to bottom"}
        className={cn(
          fabPrimary,
          "transition-all duration-200",
          isScrolling
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1 opacity-0"
        )}
      >
        {goTop ? (
          <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
        {goTop ? "Top" : "Bottom"}
      </button>
    </div>
  );
}
