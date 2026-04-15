"use client";

export const ACTIVE_SESSION_COOKIE = "agentix_active_session";

export function setActiveSessionCookie() {
  document.cookie = `${ACTIVE_SESSION_COOKIE}=1; Path=/; SameSite=Lax; Secure`;
}

export function clearActiveSessionCookie() {
  document.cookie = `${ACTIVE_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}
