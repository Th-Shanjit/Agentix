import { RegisterClient } from "./RegisterClient";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
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

  return <RegisterClient defaultCallbackUrl={callbackUrl} />;
}
