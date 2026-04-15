import { LoginClient } from "./LoginClient";
import { auth } from "@/auth";
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

  return <LoginClient defaultCallbackUrl={callbackUrl} />;
}
