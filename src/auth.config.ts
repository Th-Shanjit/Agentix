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

/** Google OAuth is opt-in (set `AUTH_GOOGLE_ENABLED=true`) so email/password stays the default. */
export function isGoogleOAuthEnabled() {
  return (
    process.env.AUTH_GOOGLE_ENABLED === "true" && isGoogleConfigured()
  );
}

const providers: NextAuthConfig["providers"] = [];

if (isGoogleOAuthEnabled()) {
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
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (user.id) token.sub = user.id;
        if (user.name != null) token.name = user.name;
        if (user.email != null) token.email = user.email;
        if (user.image != null) token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      if (session.user) {
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.picture === "string") session.user.image = token.picture;
      }
      return session;
    },
  },
  trustHost: true,
  /** Required for sessions/JWT. Set `AUTH_SECRET` in `.env.local` (see `.env.example`). */
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;
