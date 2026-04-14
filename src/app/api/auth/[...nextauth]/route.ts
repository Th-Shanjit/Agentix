import { handlers } from "@/auth";

/** Prisma + OAuth callbacks require Node (not Edge). */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
