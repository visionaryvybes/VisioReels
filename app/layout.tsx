import type { Metadata } from "next";
import "./globals.css";

const fontVariables = {
  "--font-syne": '"Syne", "Avenir Next Condensed", "Arial Narrow", "Trebuchet MS", system-ui, sans-serif',
  "--font-dm-sans": '"DM Sans", "Avenir Next", "Segoe UI", system-ui, sans-serif',
  "--font-dm-mono": '"DM Mono", "SFMono-Regular", "Cascadia Code", "Courier New", monospace',
  "--font-playfair": '"Playfair Display", "Iowan Old Style", "Times New Roman", serif',
  "--font-space-grotesk": '"Space Grotesk", "Avenir Next", "Segoe UI", system-ui, sans-serif',
  "--font-fraunces": '"Fraunces", "Iowan Old Style", "Times New Roman", serif',
  "--font-archivo-black": '"Archivo Black", Impact, Haettenschweiler, "Arial Black", sans-serif',
  "--font-instrument-serif": '"Instrument Serif", "Baskerville", "Times New Roman", serif',
  "--font-bricolage": '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif',
} as React.CSSProperties;

export const metadata: Metadata = {
  title: "VisioReels — Local AI Video Studio",
  description:
    "Create cinematic social media videos with Gemma 4 + HyperFrames-style HTML rendering. Fully local, zero API cost. TikTok, Reels, Shorts, Pinterest, X.",
  keywords: [
    "AI video studio",
    "local AI video",
    "HyperFrames",
    "Gemma 4",
    "social media reels",
    "CapCut alternative",
    "TikTok video generator",
  ],
  openGraph: {
    title: "VisioReels — Local AI Video Studio",
    description: "Gemma 4 plans the story. HTML renders the video locally. Zero cloud cost.",
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
      className="dark"
      style={fontVariables}
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
