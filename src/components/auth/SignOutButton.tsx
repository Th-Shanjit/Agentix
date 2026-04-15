"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void signOut({ callbackUrl: "/login" }).catch(() => setBusy(false));
      }}
      className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 hover:bg-white/60 disabled:cursor-wait disabled:opacity-70"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.75} />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
