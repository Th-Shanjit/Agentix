import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAlertsDigestEmail } from "@/lib/alerts/email";

export const maxDuration = 60;

function getSecret(request: Request) {
  const header = request.headers.get("x-agentix-secret");
  if (header) return header;
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

export async function POST(request: Request) {
  const expected = process.env.CRON_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Digest webhook is not configured." },
      { status: 503 }
    );
  }
  const provided = getSecret(request);
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      alertEmailsEnabled: true,
      alertDigestFrequency: "DAILY",
      email: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  let sentUsers = 0;
  let sentEvents = 0;
  let failedUsers = 0;

  for (const user of users) {
    try {
      const events = await prisma.alertEvent.findMany({
        where: { userId: user.id, sentAt: null },
        include: {
          jobListing: {
            select: {
              company: true,
              title: true,
              sourceUrl: true,
              location: true,
              postedAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 80,
      });
      if (events.length === 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastAlertDigestAt: new Date() },
        });
        continue;
      }
      await sendAlertsDigestEmail({
        to: user.email!,
        userName: user.name,
        items: events.map((e) => ({
          company: e.jobListing.company,
          role: e.jobListing.title,
          link: e.jobListing.sourceUrl,
          location: e.jobListing.location ?? null,
          matchedRole: e.matchedRole ?? null,
          postedAt: e.jobListing.postedAt,
        })),
      });
      const now = new Date();
      await prisma.$transaction([
        prisma.alertEvent.updateMany({
          where: { userId: user.id, sentAt: null },
          data: { sentAt: now },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { lastAlertDigestAt: now },
        }),
      ]);
      sentUsers += 1;
      sentEvents += events.length;
    } catch (e) {
      failedUsers += 1;
      console.error("[alerts-digest] user failed", user.id, e);
    }
  }

  return NextResponse.json({
    ok: true,
    usersScanned: users.length,
    sentUsers,
    sentEvents,
    failedUsers,
  });
}
