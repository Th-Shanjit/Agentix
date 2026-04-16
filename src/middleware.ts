import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/** Require both Auth.js session and browser-session marker for protected routes. */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const hasBrowserSession =
    req.cookies.get("agentix_active_session")?.value === "1";
  const hasAuthSession = Boolean(req.auth);
  const isAuthed = hasAuthSession && hasBrowserSession;

  if (pathname.startsWith("/api/jobs")) {
    if (isAuthed) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (pathname.startsWith("/api/user")) {
    if (isAuthed) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    pathname.startsWith("/board") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/discover")
  ) {
    if (isAuthed) return NextResponse.next();
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    if (hasAuthSession && !hasBrowserSession) {
      loginUrl.searchParams.set("reason", "browser_session_missing");
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/api/jobs/:path*",
    "/api/user/:path*",
    "/board/:path*",
    "/profile/:path*",
    "/jobs/:path*",
    "/discover/:path*",
  ],
};
