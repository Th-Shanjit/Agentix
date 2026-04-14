import { LoginClient } from "./LoginClient";
import { auth } from "@/auth";
import { isGoogleOAuthEnabled } from "@/auth.config";
import { redirect } from "next/navigation";

/** Always read env at request time (avoids stale “no providers” UI on Vercel). */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string };
}) {
  const session = await auth();
  const callbackUrl =
    searchParams?.callbackUrl && searchParams.callbackUrl.startsWith("/")
      ? searchParams.callbackUrl
      : "/board";
  if (session?.user?.id) {
    redirect(callbackUrl);
  }

  const googleEnabled = isGoogleOAuthEnabled();
  const emailEnabled = Boolean(
    process.env.EMAIL_SERVER && process.env.EMAIL_FROM
  );

  return (
    <LoginClient
      googleEnabled={googleEnabled}
      emailEnabled={emailEnabled}
      defaultCallbackUrl={callbackUrl}
    />
  );
}
