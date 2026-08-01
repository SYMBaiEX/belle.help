import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://belle.help";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Belle — Your GitHub agent is one text away",
  description:
    "Text Belle a phone number and she watches your repos, reviews pull requests, fixes issues, and merges with your approval.",
  openGraph: {
    title: "Belle — your GitHub agent",
    description: "Review, fix, and ship pull requests from anywhere.",
    siteName: "Belle",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
