import { PLATFORMS } from "./platforms";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "visio-gemma";
const OLLAMA_FALLBACK = process.env.OLLAMA_FALLBACK_MODEL || "gemma4:e4b";

export interface VideoScript {
  hook: string;
  script: string;
  captions: string[];
  hashtags: string[];
  style: {
    transition: string;
    textStyle: string;
    colorGrade: string;
  };
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export class GemmaClient {
  private baseUrl: string;

  constructor(baseUrl: string = OLLAMA_URL) {
    this.baseUrl = baseUrl;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<OllamaModel[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: OllamaModel[] };
      return data.models ?? [];
    } catch {
      return [];
    }
  }

  async generateVideoScript(
    image: string,
    platform: string,
    mood: string
  ): Promise<VideoScript> {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, platform, mood }),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({ error: "Unknown error" }))) as {
        error?: string;
      };
      throw new Error(err.error ?? `HTTP ${response.status}`);
    }

    return response.json() as Promise<VideoScript>;
  }
}

// Platform dimension configs
export const PLATFORM_CONFIGS: Record<
  string,
  { width: number; height: number; fps: number; durationInFrames: number }
> = Object.fromEntries(
  PLATFORMS.map((p) => [
    p.id,
    {
      width: p.width,
      height: p.height,
      fps: p.fps,
      durationInFrames: p.durationInFrames,
    },
  ])
);

// Detailed mood prompts for the AI system
export const MOOD_PROMPTS: Record<string, string> = {
  cinematic: `
MOOD: Cinematic
- Color grade: Teal & orange LUT, crushed blacks, slight vignette, 24fps feel
- Transitions: Slow cross-dissolve with motion blur, letterbox bars (2.35:1)
- Text: Elegant serif or thin sans, centered, subtle gold/white glow
- Pacing: Slow, deliberate, let the image breathe
- 2026 trend: AI-enhanced depth-of-field, vintage film halation
- Tone: Epic, aspirational, emotionally charged
`,
  "dark-moody": `
MOOD: Dark & Moody
- Color grade: Desaturated, lifted shadows, deep blue/teal shadows, no pure black
- Transitions: Hard cuts, occasional flash frame, smash cut
- Text: Bold condensed sans-serif, all-caps, stark white or blood red
- Pacing: Tension-building, uncomfortable silences, sudden breaks
- 2026 trend: Hypnagogic visuals, liminal spaces, SCP aesthetic
- Tone: Unsettling, powerful, visceral
`,
  vibrant: `
MOOD: Vibrant
- Color grade: Pushed saturation (+40%), warm highlights, pop-art palette
- Transitions: Snap zooms, whip pans, bounce ease, color flash
- Text: Rounded bold font, colored drop shadow, emoji integration
- Pacing: Fast, energetic, dopamine-optimized
- 2026 trend: Y2K revival, chrome effects, digital maximalism
- Tone: Joyful, energetic, celebratory
`,
  minimal: `
MOOD: Minimal
- Color grade: Slight fade/matte, neutral midtones, clean whites, no saturation push
- Transitions: Subtle fade-to-black, static cut only
- Text: Light-weight font, lowercase, generous letter-spacing, whisper thin
- Pacing: Unhurried, spacious, zen
- 2026 trend: Quiet luxury aesthetic, Scandinavian minimalism, anti-hype
- Tone: Refined, thoughtful, premium
`,
  raw: `
MOOD: Raw/Authentic
- Color grade: No grade, natural exposure, slight grain/noise, real skin tones
- Transitions: Handheld jump cuts, in-camera moves, reaction cuts
- Text: Handwritten-feel font, imperfect kerning, casual lowercase
- Pacing: Real-time, no artificial stretching, spontaneous rhythm
- 2026 trend: De-influencing, anti-aesthetic, "found footage" authenticity
- Tone: Relatable, unfiltered, trustworthy
`,
  neon: `
MOOD: Neon
- Color grade: Deep purples and blacks, cyan/magenta highlights, bloom glow, RGB chromatic aberration
- Transitions: Glitch transitions, RGB split, scanline wipes, VHS noise
- Text: Neon tube outline effect, inner glow, digital/cyberpunk font
- Pacing: Rhythmic with music, beat-synced cuts, staccato
- 2026 trend: Solarpunk neon, holographic UI overlays, vaporwave revival
- Tone: Futuristic, electric, otherworldly
`,
};

export const defaultGemmaClient = new GemmaClient();
