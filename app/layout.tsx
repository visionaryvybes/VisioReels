import type { Metadata } from "next";
import { Syne, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

// frontend-design skill: distinctive fonts, never generic Inter/Roboto
// Syne — geometric, futuristic display → headings & wordmark
const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

// DM Sans — refined, slightly condensed body text (not Inter)
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-sans",
  display: "swap",
});

// DM Mono — code blocks and technical readouts
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VisioReels — Local AI Video Studio",
  description:
    "Create cinematic social media videos with Gemma 4 + Remotion. Fully local, zero API cost. TikTok, Reels, Shorts, Pinterest, X.",
  keywords: [
    "AI video studio",
    "local AI video",
    "Remotion",
    "Gemma 4",
    "social media reels",
    "CapCut alternative",
    "TikTok video generator",
  ],
  openGraph: {
    title: "VisioReels — Local AI Video Studio",
    description: "Gemma 4 writes the code. Remotion renders the video. Zero cloud cost.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmSans.variable} ${dmMono.variable} dark`}
      suppressHydrationWarning
    >
      <body
        className="bg-[#080808] text-white antialiased min-h-screen"
        style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
