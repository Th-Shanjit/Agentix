import { LoginClient } from "./LoginClient";

export default function LoginPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
  const emailEnabled = Boolean(
    process.env.EMAIL_SERVER && process.env.EMAIL_FROM
  );

  return (
    <LoginClient googleEnabled={googleEnabled} emailEnabled={emailEnabled} />
  );
}
