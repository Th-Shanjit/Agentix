import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { Providers } from "@/components/providers/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e0e5ec",
};

export const metadata: Metadata = {
  title: "Agentix — Career pipeline",
  description: "Personal AI career pipeline: jobs, trackers, resume, ATS insights.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en">
      <body className={`${inter.variable} touch-manipulation font-sans antialiased`}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
