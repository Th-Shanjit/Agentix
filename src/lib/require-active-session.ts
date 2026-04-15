import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const ACTIVE_SESSION_COOKIE = "agentix_active_session";

export async function requireActiveSession(callbackUrl: string) {
  const session = await auth();
  const hasBrowserSession =
    cookies().get(ACTIVE_SESSION_COOKIE)?.value === "1";

  if (!session?.user?.id || !hasBrowserSession) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return session;
}
