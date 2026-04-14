import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { Providers } from "@/components/providers/Providers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /** Default UI chrome matches dark shell; light mode still overrides via `data-theme`. */
  themeColor: "#19181A",
};

export const metadata: Metadata = {
  title: "Agentix — Jobs & search",
  description:
    "Save roles, search listings, store résumé text, and use AI for matching.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" data-theme="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('agentix-theme');document.documentElement.dataset.theme=(t==='light'?'light':'dark');}catch(e){document.documentElement.dataset.theme='dark';}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} touch-manipulation font-sans antialiased`}>
        <Providers session={session}>{children}</Providers>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
