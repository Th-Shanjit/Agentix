import { LoginClient } from "./LoginClient";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

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

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
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
