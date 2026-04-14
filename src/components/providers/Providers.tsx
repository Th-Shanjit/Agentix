"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { AppToaster } from "@/components/ui/AppToaster";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

type ProvidersProps = {
  children: ReactNode;
  session: Session | null;
};

export function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus>
      <ThemeProvider>
        {children}
        <AppToaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
