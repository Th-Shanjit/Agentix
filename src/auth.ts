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
});
