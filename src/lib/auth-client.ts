"use client";

import { signOut as nextAuthSignOut } from "next-auth/react";

/** Sign out then hard-navigate so RSC props and cookies stay aligned (avoids stale UI). */
export async function signOutAndReload(callbackUrl = "/board") {
  await nextAuthSignOut({ redirect: false });
  window.location.assign(callbackUrl);
}
