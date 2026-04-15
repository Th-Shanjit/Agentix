import type { ReactNode } from "react";
import { GlassBackground } from "./GlassBackground";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { TopActions } from "./TopActions";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[var(--shell-bg)]">
      <GlassBackground />
      <div className="relative z-10 flex min-h-dvh">
        <TopActions />
        <DesktopSidebar />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <main className="flex-1 px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-4 md:px-8 md:pb-10 md:pt-8">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}
