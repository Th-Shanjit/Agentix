"use client";

import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { AppToaster } from "@/components/ui/AppToaster";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ACTIVE_SESSION_COOKIE, setActiveSessionCookie } from "@/lib/browser-session";
import { track } from "@vercel/analytics";

function hasActiveSessionCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${ACTIVE_SESSION_COOKIE}=`));
}

function ActiveSessionCookieHealer() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") return;
    if (hasActiveSessionCookie()) return;
    setActiveSessionCookie();
    track("auth_cookie_autoheal");
  }, [status]);
  return null;
}

type ProvidersProps = {
  children: ReactNode;
  session: Session | null;
};

export function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus
      refetchInterval={5 * 60}
    >
      <ThemeProvider>
        <ActiveSessionCookieHealer />
        {children}
        <AppToaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
