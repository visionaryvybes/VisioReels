export interface Platform {
  id: string;
  name: string;
  icon: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  description: string;
  aspectRatio: string;
}

export interface Mood {
  id: string;
  name: string;
  description: string;
  colorGrade: string;
  transitionStyle: string;
  textStyle: string;
  emoji: string;
}

export const PLATFORMS: Platform[] = [
  {
    id: "tiktok",
    name: "TikTok",
    icon: "Music",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 450,
    description: "15s · 9:16 · Viral hooks",
    aspectRatio: "9:16",
  },
  {
    id: "reels",
    name: "Instagram Reels",
    icon: "Instagram",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 900,
    description: "30s · 9:16 · Story-driven",
    aspectRatio: "9:16",
  },
  {
    id: "shorts",
    name: "YouTube Shorts",
    icon: "Youtube",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 600,
    description: "20s · 9:16 · Educational",
    aspectRatio: "9:16",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    icon: "Pin",
    width: 1000,
    height: 1500,
    fps: 30,
    durationInFrames: 300,
    description: "10s · 2:3 · Visual-rich",
    aspectRatio: "2:3",
  },
  {
    id: "x",
    name: "X (Twitter)",
    icon: "Twitter",
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 450,
    description: "15s · 16:9 · Commentary",
    aspectRatio: "16:9",
  },
];

export const MOODS: Mood[] = [
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Film-grade color, letterbox, epic",
    colorGrade: "Teal & orange LUT, crushed blacks, film grain",
    transitionStyle: "Slow cross-dissolve with motion blur",
    textStyle: "Serif font, centered, subtle glow",
    emoji: "🎬",
  },
  {
    id: "dark-moody",
    name: "Dark & Moody",
    description: "Low-key, brooding, atmospheric",
    colorGrade: "Desaturated, lifted shadows, deep blues",
    transitionStyle: "Hard cuts, flash frames",
    textStyle: "Bold sans-serif, all-caps, harsh white",
    emoji: "🌑",
  },
  {
    id: "vibrant",
    name: "Vibrant",
    description: "Saturated, energetic, poppy",
    colorGrade: "Boosted saturation, warm highlights, pop art",
    transitionStyle: "Snap zooms, whip pans, bounce",
    textStyle: "Rounded bold, colored drop shadow",
    emoji: "🌈",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean, whitespace, editorial",
    colorGrade: "Neutral, slight fade, clean whites",
    transitionStyle: "Subtle fade, static cuts",
    textStyle: "Light weight, lowercase, generous spacing",
    emoji: "◻️",
  },
  {
    id: "raw",
    name: "Raw/Authentic",
    description: "Unfiltered, lo-fi, real",
    colorGrade: "No grade, natural colors, slight noise",
    transitionStyle: "Handheld jump cuts, real-time",
    textStyle: "Handwritten feel, messy, spontaneous",
    emoji: "📱",
  },
  {
    id: "neon",
    name: "Neon",
    description: "Cyberpunk glow, electric, futuristic",
    colorGrade: "Deep purples, cyan highlights, bloom effect",
    transitionStyle: "Glitch transitions, RGB split",
    textStyle: "Neon outline, glow effect, digital font",
    emoji: "⚡",
  },
];
