"use client";

import { signOut as nextAuthSignOut } from "next-auth/react";

/** Sign out then hard-navigate so RSC props and cookies stay aligned (avoids stale UI). */
export async function signOutAndReload(callbackUrl = "/board") {
  try {
    await nextAuthSignOut({ redirect: false });
    window.location.assign(callbackUrl);
  } catch {
    // Fallback to a guaranteed unauthenticated entrypoint.
    window.location.assign("/login");
  }
}
