"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { clearActiveSessionCookie } from "@/lib/browser-session";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        clearActiveSessionCookie();
        void signOut({ callbackUrl: "/login" }).catch(() => setBusy(false));
      }}
      className="btn-secondary text-sm disabled:cursor-wait"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.75} />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
