"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/board" })}
      className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 hover:bg-white/60"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.75} />
      Sign out
    </button>
  );
}
