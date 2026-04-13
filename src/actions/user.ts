"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { RemotePreference } from "@prisma/client";
import { Prisma } from "@prisma/client";

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

/** Optional search defaults (years, countries, remote mode). */
export async function updateSearchPreferences(data: {
  yearsExperience: number | null;
  /** Comma-separated ISO country names or codes, e.g. "India, UK". */
  preferredCountries: string;
  searchRemotePreference: RemotePreference;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false as const, error: "Unauthorized." };
  }

  const raw = data.preferredCountries.trim();
  const arr = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        yearsExperience: data.yearsExperience,
        preferredCountries: arr.length ? arr : Prisma.JsonNull,
        searchRemotePreference: data.searchRemotePreference,
      },
    });
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save preferences.";
    return { ok: false as const, error: msg };
  }
}
