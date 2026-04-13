import type { NormalizedJob } from "./types";

const SPAM = [
  /crypto.*(airdrop|token)/i,
  /work.from.home.*\$500/i,
  /click here to earn/i,
];

/** Returns rejection reason or null if OK. */
export function validateNormalizedJob(j: NormalizedJob): string | null {
  if (!j.title.trim() || j.title.length < 3) return "title_too_short";
  if (!j.company.trim() || j.company.length < 2) return "company_invalid";
  if (!j.applyUrl.startsWith("http")) return "bad_url";
  const blob = `${j.title} ${j.description ?? ""}`;
  for (const re of SPAM) {
    if (re.test(blob)) return "spam_pattern";
  }
  return null;
}
