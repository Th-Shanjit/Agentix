"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function registerWithEmailPassword(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const norm = email.trim().toLowerCase();
  if (!norm.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const existing = await prisma.user.findUnique({ where: { email: norm } });
  if (existing) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email: norm,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  return { ok: true };
}
