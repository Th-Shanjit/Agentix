import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import bcrypt from "bcryptjs";
import authConfig from "@/auth.config";
import { prisma } from "@/lib/prisma";

const emailConfigured =
  Boolean(process.env.EMAIL_SERVER) && Boolean(process.env.EMAIL_FROM);

const providers = [
  Credentials({
    id: "credentials",
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const rawEmail = credentials?.email;
      const rawPassword = credentials?.password;
      const email =
        typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
      const password = typeof rawPassword === "string" ? rawPassword : "";
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          passwordHash: true,
        },
      });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return {
        id: user.id,
        email: user.email ?? email,
        name: user.name,
        image: user.image,
      };
    },
  }),
  ...authConfig.providers,
];
if (emailConfigured) {
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    })
  );
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  adapter: PrismaAdapter(prisma),
  /** Set `AUTH_DEBUG=true` in Vercel temporarily to log `[auth][debug]` / `[auth][error]` for OAuth issues. */
  debug: process.env.AUTH_DEBUG === "true",
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
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
});
