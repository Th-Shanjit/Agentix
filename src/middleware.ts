import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/** App shell routes stay public; data APIs require a session (401 when anonymous). */
export default auth((req) => {
  if (req.auth) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/jobs")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (pathname.startsWith("/api/user")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/api/jobs/:path*", "/api/user/:path*"],
};
