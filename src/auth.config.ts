import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

function cleanEnv(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

function googleCreds() {
  const clientId = cleanEnv(
    process.env.GOOGLE_CLIENT_ID ??
      process.env.AUTH_GOOGLE_ID ??
      process.env.AUTH_GOOGLE_CLIENT_ID
  );
  const clientSecret = cleanEnv(
    process.env.GOOGLE_CLIENT_SECRET ??
      process.env.AUTH_GOOGLE_SECRET ??
      process.env.AUTH_GOOGLE_CLIENT_SECRET
  );
  return { clientId, clientSecret };
}

export function isGoogleConfigured() {
  const { clientId, clientSecret } = googleCreds();
  return Boolean(clientId) && Boolean(clientSecret);
}

const providers: NextAuthConfig["providers"] = [];

if (isGoogleConfigured()) {
  const { clientId, clientSecret } = googleCreds();
  providers.push(
    Google({
      clientId,
      clientSecret,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export default {
  providers,
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  /** Required for sessions/JWT. Set `AUTH_SECRET` in `.env.local` (see `.env.example`). */
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;
