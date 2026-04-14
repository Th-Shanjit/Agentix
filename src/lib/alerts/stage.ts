import { prisma } from "@/lib/prisma";
import {
  deterministicRoleGate,
  parsePreferredRoles,
  semanticRoleMatch,
} from "@/lib/alerts/relevance";

function normalizedCompany(s: string) {
  return s.trim().toLowerCase();
}

export async function stageAlertCandidatesForListing(params: {
  jobListingId: string;
  company: string;
  role: string;
}) {
  const company = normalizedCompany(params.company);
  if (!company || !params.role.trim()) return { staged: 0 };

  const trackers = await prisma.tracker.findMany({
    where: { active: true },
    select: { id: true, userId: true, company: true },
  });

  const targetTrackers = trackers.filter(
    (t) => normalizedCompany(t.company) === company
  );
  if (targetTrackers.length === 0) return { staged: 0 };

  const userIds = Array.from(new Set(targetTrackers.map((t) => t.userId)));
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      alertEmailsEnabled: true,
      alertDigestFrequency: "DAILY",
      email: { not: null },
    },
    select: {
      id: true,
      preferredRoles: true,
    },
  });

  let staged = 0;
  for (const user of users) {
    const preferred = parsePreferredRoles(user.preferredRoles);
    if (preferred.length === 0) continue;
    const gate = deterministicRoleGate(params.role, preferred);
    if (!gate.ok) continue;
    const semantic = await semanticRoleMatch(params.role, preferred);
    if (!semantic.ok) continue;
    const tracker = targetTrackers.find((t) => t.userId === user.id) ?? null;
    await prisma.alertEvent.upsert({
      where: {
        userId_jobListingId: {
          userId: user.id,
          jobListingId: params.jobListingId,
        },
      },
      create: {
        userId: user.id,
        jobListingId: params.jobListingId,
        trackerId: tracker?.id,
        matchedRole: semantic.matchedRole,
      },
      update: {
        trackerId: tracker?.id ?? undefined,
        matchedRole: semantic.matchedRole ?? undefined,
      },
    });
    staged += 1;
  }

  return { staged };
}
