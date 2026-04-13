import type { ReactNode } from "react";
import { GlassBackground } from "./GlassBackground";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNav } from "./MobileBottomNav";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-dvh bg-[#e0e5ec]">
      <GlassBackground />
      <div className="relative z-10 flex min-h-dvh">
        <DesktopSidebar />
        <div className="flex min-h-dvh flex-1 flex-col">
          <main className="flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] md:px-8 md:pb-10 md:pt-8">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}
