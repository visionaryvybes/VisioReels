import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "sans-serif"],
});

export const metadata: Metadata = {
  title: "VisioReels — AI Video Studio",
  description:
    "Create viral social media videos with Gemma 4 AI + Remotion rendering. TikTok, Instagram Reels, YouTube Shorts, Pinterest, X — all from a single image.",
  keywords: [
    "AI video",
    "social media",
    "TikTok",
    "Instagram Reels",
    "YouTube Shorts",
    "Remotion",
    "Gemma 4",
    "CapCut alternative",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="bg-zinc-950 text-white antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
