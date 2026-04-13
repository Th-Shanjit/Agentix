"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Persist extracted résumé plain text for the signed-in user (multi-device).
 * Pass empty string to clear.
 */
export async function saveResumeText(text: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false as const, error: "Unauthorized." };
  }

  const trimmed = text.trim();
  const resumeText = trimmed.length > 0 ? trimmed : null;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { resumeText },
    });
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save résumé.";
    return { ok: false as const, error: msg };
  }
}
