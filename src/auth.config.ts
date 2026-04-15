import type { NextAuthConfig } from "next-auth";

const providers: NextAuthConfig["providers"] = [];

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
