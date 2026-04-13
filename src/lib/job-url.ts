import { createHash } from "crypto";

/** Normalize posting URL for deduplication (host + path, no query/hash). */
export function canonicalJobUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function jobDedupeKey(url: string): string {
  const c = canonicalJobUrl(url);
  return createHash("sha256").update(c).digest("hex");
}
