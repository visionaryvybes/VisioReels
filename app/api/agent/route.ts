import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import * as ts from "typescript";
import {
  REEL_TYPOGRAPHY,
  parseReelDecorId,
  parseReelTypographyId,
  type ReelDecorId,
  type ReelTypographyId,
} from "@/lib/reel-typography";
import {
  buildHyperframesCreativeBlock,
  buildReelRemixDirective,
  type HyperframesCaptionTone,
  type HyperframesCreativeProfile,
  type HyperframesMotionFeel,
} from "@/lib/hyperframes-prompt";
import { findBannedPhrases, isThinText } from "@/lib/copy-guard";
import { renderHtmlSlidesToPng } from "@/lib/html-slide-render";
import { computeHtmlSlideVideoDuration } from "@/lib/html-slide-duration";
import type { ConceptBrief } from "@/lib/concept-brief";
import { parseDirectorBrief, briefToConceptCompat, type DirectorBrief } from "@/lib/director-brief";
import { buildContextQueries, fetchWebContext, formatWebContext } from "@/lib/web-context";
import {
  BRAIN_CREATIVE_DIRECTIVES,
  FREEFORM_CODE_CREATIVE_DIRECTIVES,
  GEMMA_JSON_CREATIVE_DIRECTIVES,
  HTML_SLIDES_CREATIVE_DIRECTIVES,
} from "@/lib/agent-creative-directives";
import { generateSpeech, resolveProfileForNarration, ensurePresetProfile } from "@/lib/voicebox";
import { buildVoiceDirection, buildNarrationText, type CaptionTone, type MotionFeel } from "@/lib/voice-director";
import { buildCulturalContext, type Platform } from "@/lib/cultural-context";

/** Repo-root paths for fs I/O. turbopackIgnore prevents NFT from tracing all of process.cwd(). */
function projectPath(...parts: string[]): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), ...parts);
}
const OLLAMA_BASE = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_URL = `${OLLAMA_BASE}/api/chat`;
const MODEL = process.env.OLLAMA_MODEL ?? "visio-gemma";
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL ?? "gemma4:e4b";

// ── Helpers (freeform TSX mode — unchanged for requests WITHOUT attachments) ──

function resolveFile(r: string): string | null {
  const l = r.toLowerCase();
  if (l.includes("urban") || l.includes("drift")) return "remotion/compositions/UrbanDrift.tsx";
  if (l.includes("glitch") || l.includes("protocol") || l.includes("cyber")) return "remotion/compositions/GlitchProtocol.tsx";
  if (l.includes("momentum") || l.includes("sport")) return "remotion/compositions/Momentum.tsx";
  if (l.includes("reel") || l.includes("tiktok") || l.includes("caption") || l.includes("hook")) return "remotion/compositions/Reel.tsx";
  return null; // create new
}

function needsImages(r: string): boolean {
  return /image|photo|picture|unsplash|drone|aerial|stock\s*photo|photograph/i.test(r);
}

/** When the user is not asking for stock photos, we push pure Remotion/SVG “code graphics” power. */
function wantsPhotoBackgrounds(r: string): boolean {
  return needsImages(r) || /\b(bg|wallpaper|backdrop)\b.*\b(photo|image|unsplash)\b/i.test(r);
}

// ── Ollama streaming ──────────────────────────────────────────────────────────

// Streaming timeout: default for reel JSON / short jobs. Hyperframes & freeform pass explicit timeoutMs.
const STREAM_TIMEOUT_MS = 180_000;

const IS_VERCEL_DEPLOY = Boolean(process.env.VERCEL);
/** Keep stream waits below route maxDuration (300s) minus vision, brain, and PNG render. */
const STREAM_CEILING_MS = IS_VERCEL_DEPLOY ? 278_000 : 900_000;

/** HTML slides: each block repeats fonts + full-bleed layout — allow much more wall time than default. */
function htmlSlideStreamTimeoutMs(slideCap: number, numPredict: number): number {
  const nSlides = Math.max(1, Math.min(24, Math.round(Number(slideCap) || 1)));
  const np = Math.max(512, Math.min(16_384, Math.round(Number(numPredict) || 4096)));
  const bySlides = 90_000 + nSlides * 62_000;
  const byPredict = Math.floor(np / 2048) * 28_000;
  const want = Math.max(180_000, bySlides + byPredict);
  return Math.min(STREAM_CEILING_MS, want);
}

async function streamOllama(
  prompt: string,
  onToken: (t: string) => void,
  opts: { temperature?: number; num_predict?: number; timeoutMs?: number } = {}
): Promise<string> {
  const timeoutMs =
    typeof opts.timeoutMs === "number" && opts.timeoutMs >= 15_000 ? opts.timeoutMs : STREAM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const call = (model: string) =>
    fetch(OLLAMA_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        think: false,
        options: {
          temperature: opts.temperature ?? 0.1,
          top_p: 0.9,
          num_ctx: 16384,
          num_predict: opts.num_predict ?? 4096,
          num_thread: 8,
          repeat_penalty: 1.18,
        },
      }),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("Failed to fetch")) {
        throw new Error(`Ollama is offline — start it with: ollama serve`);
      }
      throw err;
    });

  try {
    let res = await call(MODEL);
    if (res.status === 404 && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
      res = await call(FALLBACK_MODEL);
    }
    if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status} — model may be missing or Ollama crashed`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = "";
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const tok = JSON.parse(line)?.message?.content ?? "";
          if (tok) { full += tok; onToken(tok); }
        } catch { /* skip malformed chunk */ }
      }
    }
    return full.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      throw new Error(`Ollama timed out after ${timeoutMs / 1000}s — reduce num_predict or try a shorter prompt`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURED MODE — when images are attached, we drive a templated reel
// (<CinematicReel>) via JSON. Gemma only picks captions / accents / transitions,
// not motion code. Production-quality output every single time.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Canvas / aspect ratio ────────────────────────────────────────────────────

type Aspect = "9:16" | "1:1" | "4:5" | "16:9";
const ASPECTS: Record<Aspect, { w: number; h: number; label: string }> = {
  "9:16": { w: 1080, h: 1920, label: "9:16 (Reels / TikTok / Shorts)" },
  "1:1":  { w: 1080, h: 1080, label: "1:1 (feed square)" },
  "4:5":  { w: 1080, h: 1350, label: "4:5 (feed portrait)" },
  "16:9": { w: 1920, h: 1080, label: "16:9 (landscape)" },
};

type Pace = "chill" | "balanced" | "fast" | "hype";
const PACE: Record<Pace, { sceneLen: number; transLen: number; blurb: string }> = {
  chill:    { sceneLen: 110, transLen: 24, blurb: "slow cinematic holds, long fades" },
  balanced: { sceneLen: 75,  transLen: 18, blurb: "default CinematicReel rhythm" },
  fast:     { sceneLen: 55,  transLen: 12, blurb: "punchy TikTok-ready cuts" },
  hype:     { sceneLen: 38,  transLen: 8,  blurb: "beat-driven hype energy" },
};

function parseCreativeProfile(body: {
  motionFeel?: unknown;
  captionTone?: unknown;
  transitionEnergy?: unknown;
}): HyperframesCreativeProfile {
  const motionFeel: HyperframesCreativeProfile["motionFeel"] =
    body.motionFeel === "smooth" ||
    body.motionFeel === "snappy" ||
    body.motionFeel === "bouncy" ||
    body.motionFeel === "dramatic" ||
    body.motionFeel === "dreamy"
      ? body.motionFeel
      : "snappy";
  const captionTone: HyperframesCreativeProfile["captionTone"] =
    body.captionTone === "hype" ||
    body.captionTone === "corporate" ||
    body.captionTone === "tutorial" ||
    body.captionTone === "storytelling" ||
    body.captionTone === "social"
      ? body.captionTone
      : "hype";
  const transitionEnergy: HyperframesCreativeProfile["transitionEnergy"] =
    body.transitionEnergy === "calm" || body.transitionEnergy === "medium" || body.transitionEnergy === "high"
      ? body.transitionEnergy
      : "medium";
  return { motionFeel, captionTone, transitionEnergy };
}

function reelJsonTemperature(c: HyperframesCreativeProfile): number {
  let t = 0.3;
  if (c.transitionEnergy === "high") t += 0.04;
  if (c.captionTone === "social" || c.captionTone === "hype") t += 0.03;
  if (c.motionFeel === "bouncy" || c.motionFeel === "dramatic") t += 0.02;
  return Math.min(0.45, t);
}

/** Slightly warmer beam for freeform TSX when creative controls ask for variety. */
function freeformTemperature(c: HyperframesCreativeProfile): number {
  let t = 0.12;
  if (c.transitionEnergy === "high") t += 0.05;
  if (c.captionTone === "social" || c.captionTone === "hype") t += 0.05;
  if (c.motionFeel === "bouncy" || c.motionFeel === "dramatic") t += 0.04;
  return Math.min(0.28, t);
}

/** Pushes Gemma toward Claude-design / HyperFrames-style programmatic motion graphics, not only photo cards. */
function buildCodeVisualPowerBlock(
  creative: HyperframesCreativeProfile,
  canvasW: number,
  canvasH: number,
  userRequest: string
): string {
  const wantPhotos = wantsPhotoBackgrounds(userRequest);
  const photoLine = wantPhotos
    ? "Photos allowed: use <Img src=\"https://images.unsplash.com/photo-…?w=…&h=…&fit=crop&q=80\" /> when it fits the brief. Still ADD SVG overlays (charts, labels, grids, brackets) on top — hybrid beats flat wallpaper."
    : "DEFAULT to code-built visuals only: SVG + CSS gradients + type — no Unsplash unless the user explicitly asked for photos, stock imagery, drones, or wallpapers. Abstract, data, motion-design, and infographic reels should be 100% programmatic (no fake stock).";

  const toneHint =
    creative.captionTone === "corporate"
      ? "Favor crisp axes, bar/readout aesthetics, subtle grids, trustworthy motion."
      : creative.captionTone === "tutorial"
        ? "Favor step numbers, arrows, callout lines, checklist motion."
        : creative.captionTone === "storytelling"
          ? "Favor cinematic gradients, light leaks as SVG shapes, chapter titles."
          : "Favor kinetic neon lines, glitch grids, punchy scale pops — still deterministic.";

  return `═══ REMOTION CODE GRAPHICS (HyperFrames + full canvas power) ═══
${photoLine}
- Whole scenes from JSX: <svg> (line, polyline, path, circle, rect, linearGradient), stacked <AbsoluteFill> layers, thin divs as 1px rules, “HUD” corners, scanline strips.
- Charts / metrics: draw axes + animated polyline or bars; reveal with interpolate() on stroke-dashoffset, clip-path, or opacity stagger — never “placeholder” text only.
- Motion: perspective grids, parallax bands, rotating geometry, springy typography; use blend modes sparingly (multiply/screen/overlay).
- Type: display + mono for numbers; vary scale/tracking/opacity across sequences — ${toneHint}
- Richness bar: at least ${wantPhotos ? "two" : "three"} visually distinct <Sequence> blocks (or TransitionSeries segments) with different graphic ideas, not one static composition.
- All layout math must use useVideoConfig() (${canvasW}×${canvasH}) or % of width/height so export stays sharp.
`;
}

/** CinematicReel: duration = n·sceneLen + OUTRO − (n−1)·transLen (see computeReelDuration). */
const OUTRO_FRAMES = 20;

function computeSceneTimingForTarget(
  targetSec: number,
  sceneCount: number,
  pace: Pace
): { sceneLen: number; transLen: number } {
  const base = PACE[pace];
  let transLen = base.transLen;
  const targetFrames = Math.round(Math.max(5, targetSec) * 30);
  const n = Math.max(1, sceneCount);
  let sceneLen = (targetFrames - OUTRO_FRAMES + (n - 1) * transLen) / n;
  sceneLen = Math.round(sceneLen);
  sceneLen = Math.max(30, Math.min(900, sceneLen));
  if (sceneLen <= 36 && targetSec < 18 && n >= 4) {
    transLen = Math.max(8, transLen - 6);
    sceneLen = Math.round((targetFrames - OUTRO_FRAMES + (n - 1) * transLen) / n);
    sceneLen = Math.max(30, Math.min(900, sceneLen));
  }
  return { sceneLen, transLen };
}

function copyLimitsForDuration(targetSec: number): { captionMax: number; kickerMax: number } {
  if (targetSec <= 20) return { captionMax: 36, kickerMax: 56 };
  if (targetSec <= 45) return { captionMax: 48, kickerMax: 100 };
  if (targetSec <= 90) return { captionMax: 56, kickerMax: 160 };
  return { captionMax: 72, kickerMax: 220 };
}

function reelJsonNumPredict(targetSec: number): number {
  return Math.min(8192, Math.round(2200 + targetSec * 42));
}

function freeformNumPredict(targetSec: number): number {
  return Math.min(16384, Math.round(3400 + targetSec * 65));
}

/** HTML slide Gemma output scales with slide count; vision adds context — cap for efficiency. */
function htmlSlideNumPredict(slideCap: number, hasImages: boolean): number {
  const base = hasImages ? 3800 : 3000;
  const per = hasImages ? 2000 : 2400;
  return Math.min(16384, base + Math.max(1, slideCap) * per);
}

// ── Vision pre-pass (mirrors /api/slides/generate) ───────────────────────────
// For each attachment we compute dominant colour + brightness via sharp AND
// send a shrunk JPEG to Gemma so it can describe subject / mood / palette.

interface ImageStats {
  path: string;
  name: string;
  width: number;
  height: number;
  dominant: string;     // hex
  brightness: number;   // 0..1
  /** Vision-only JPEG (never written over the original upload in public/). */
  base64: string;
}

interface VisionNote {
  path: string;
  subject: string;
  mood: string;
  palette: string[];
  brightness: number;
  /** Spatial layout — where are the key subjects? e.g. "subject fills right half, open space bottom-left" */
  composition?: string;
  /** Best text placement zone — e.g. "bottom-left", "top-center", "right-panel" */
  text_zone?: string;
  /** Content category — e.g. "interior-design", "portrait", "product", "landscape", "food", "architecture" */
  content_type?: string;
  /** Suggested copy style from image content — e.g. "luxury lifestyle", "editorial fashion", "tech product launch" */
  copy_style?: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

async function analyzeImage(relPath: string, name: string): Promise<ImageStats | null> {
  const full = projectPath("public", relPath);
  if (!fs.existsSync(full)) return null;
  try {
    const img = sharp(full);
    const meta = await img.metadata();
    const { dominant } = await img.stats();
    const hex = rgbToHex(dominant.r, dominant.g, dominant.b);
    const brightness = (0.299 * dominant.r + 0.587 * dominant.g + 0.114 * dominant.b) / 255;
    const buf = await sharp(full)
      .rotate()
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return {
      path: relPath,
      name,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      dominant: hex,
      brightness,
      base64: buf.toString("base64"),
    };
  } catch {
    return null;
  }
}

interface ChatMessage {
  role: "user" | "system" | "assistant";
  content: string;
  images?: string[];
}

// Timeout for non-streaming (brain/vision) calls: 60s should be ample for JSON responses.
const CHAT_TIMEOUT_MS = 60_000;

async function callOllamaChat(messages: ChatMessage[], jsonMode: boolean): Promise<string> {
  // NOTE: Do NOT set think:false with format:"json" — Gemma 4 silently ignores the
  // format constraint when think is disabled (Ollama bug #15260). Omit think entirely
  // so JSON mode works correctly. Strip any <think>...</think> blocks in post-processing.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  const payload = {
    messages,
    stream: false,
    ...(jsonMode ? { format: "json" } : {}),
    options: {
      temperature: 0.22,
      top_p: 0.85,
      top_k: 32,
      repeat_penalty: 1.22,
      num_ctx: 16384,
      num_predict: 900,
    },
  };
  const call = (model: string) =>
    fetch(OLLAMA_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, model }),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("Failed to fetch")) {
        throw new Error(`Ollama is offline — start it with: ollama serve`);
      }
      throw err;
    });

  try {
    let res = await call(MODEL);
    if (res.status === 404 && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) res = await call(FALLBACK_MODEL);
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status} — model may be missing or Ollama crashed`);
    const j = (await res.json()) as { message?: { content?: string } };
    // Strip <think>...</think> blocks that Gemma 4 emits in thinking mode
    const raw = j.message?.content ?? "";
    return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      throw new Error(`Ollama timed out after ${CHAT_TIMEOUT_MS / 1000}s — brain/vision pass is taking too long`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Brain / Director pass ─────────────────────────────────────────────────────
// Produces a rich per-scene DirectorBrief. Gemma receives this brief before
// generating any code — it's the creative director briefing the executor.
// Gemma does NOT think creatively when coding; it just executes the brief.

const PRIMITIVES_CATALOG = `
AVAILABLE REMOTION PRIMITIVES (import from "../components/primitives"):
  HUDCorners       — mission-control bracket corners that slide in; props: color, size, opacity, revealFrames
  StarField        — deterministic parallax star layer; props: count, speed, opacity, seed, layers
  GridOverlay      — flat or perspective SVG grid; props: opacity, color, cellSize, perspective, revealFrames
  KineticTitle     — per-word spring stagger animation; props: text, frame, color, fontFamily, fontSize, fontWeight, stagger, reveal("slide-up"|"fade"|"scale"|"slide-right"), startFrame
  TelemetryCounter — animated number counter with label+unit; props: from, to, frame, duration, decimals, label, unit, color, timeFormat
  StatusBar        — fixed top/bottom HUD strip with colored dot indicators; props: items[{label,status("ok"|"warn"|"info"|"active"),value}], position("top"|"bottom")
  DataReadout      — grid of labeled metrics; props: metrics[{label,value,unit,animateTo}], direction, stagger, accentColor
  ScanLines        — CRT scanline overlay; props: opacity, lineSpacing, animate, speed
  LightLeak        — screen-blend radial flash; props: color, peakFrame, duration, opacity, origin
  NoiseLayer       — animated film grain using @remotion/noise; props: opacity, speed, scale, blendMode("overlay"|"screen"|"multiply"), seed
`.trim();

/**
 * Detects the creative intent from the user's brief — roast, comedy, hype,
 * motivation, tutorial, etc. Returns structured intent metadata for prompt injection.
 */
function detectCreativeIntent(brief: string): {
  isRoast: boolean;
  isComedy: boolean;
  isMotivation: boolean;
  isTutorial: boolean;
  isHype: boolean;
  subjectName: string | null;
  intentLabel: string;
  toneGuidance: string;
  arcOverride: string | null;
} {
  const b = brief.toLowerCase();
  const isRoast =
    /\broast\b|\bsavage\b|\bno\s+mercy\b|\bclown\b|\bclown on\b|\bdrag\b|\bcall.*out\b|\bputs.*on.*blast\b|\bexpose\b|\btake.*down\b|\bmake fun of\b|\bether\b|\bdiss\b/.test(
      b
    );
  const isComedy = isRoast || /\bfunny\b|\bhilarious\b|\bcringe\b|\bmeme\b|\bjoke\b|\bcomic\b|\bsatire\b/.test(b);
  // Don't tag "motivation" when this is clearly a roast — avoids "Monday wake up" + roast fighting tone
  const isMotivation =
    !isRoast &&
    /\bmotivat\b|\binspir\b|\bhustle\b|\bgrind\b|\brise\b|\bwake.*up\b|\bpep.*talk\b/.test(b);
  const isTutorial = /\bhow to\b|\bstep\b|\bguide\b|\btutorial\b|\blearn\b|\btips?\b/.test(b);
  const isHype = !isRoast && !isTutorial && /\bhype\b|\bfire\b|\blit\b|\bbang\b|\bbanger\b/.test(b);

  // Name: "roast a guy named elvis", "roast Elvis", "roast my friend Elvis"
  let subjectName: string | null = null;
  const namePatterns = [
    /\broast(?:ing)?\s+(?:a\s+)?(?:guy|dude|man|woman|girl|person|friend|homie|bro|sis)\s+named\s+([A-Za-z][A-Za-z'-]*)/i,
    /\broast(?:ing)?\s+(?:a\s+)?(?:guy|dude|man|woman|girl|person|friend)\s+called\s+([A-Za-z][A-Za-z'-]*)/i,
    /\broast\s+my\s+friend\s+([A-Za-z][A-Za-z'-]*)/i,
    /\broast(?:ing)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
    /\broast(?:ing)?\s+([a-z][a-z]+)\b/i,
  ];
  for (const p of namePatterns) {
    const m = brief.match(p);
    if (m?.[1] && !/^(a|the|this|that|him|her|them|someone)$/i.test(m[1])) {
      subjectName = m[1].trim();
      break;
    }
  }

  let intentLabel = "general";
  let toneGuidance = "";
  let arcOverride: string | null = null;

  if (isRoast) {
    intentLabel = "roast";
    const name = subjectName ?? "them";
    toneGuidance = `THIS IS A ROAST VIDEO. You are roasting ${name}. Every headline must be a savage, funny, SPECIFIC observation about what you literally see in that photo (outfit, face, doll/plastic look, car interior, cigarette, hair, expression).
ROAST RULES:
- Find the most embarrassing, funny, or absurd VISUAL detail and write ABOUT THAT — not about "work" or "Monday motivation"
- Use roast language: "bro", "nah", "sir", "ma'am", "the audacity", "we need to talk", "nobody:", "POV:", "bestie no", "tell me why"
- Forbidden vocabulary (startup / LinkedIn brain): deploy, sprint, iterate, throughput, PMF, refactor, MVP, latency, pipeline, stakeholder, retro, scope, ship it, fail fast, hustle culture, "build cycle", "alignment", "scale"
- Be specific — not "the vibe" but what you SEE: green tweed, toy figure, sequin jacket, smoking in the car, doll proportions, etc.
- Scale: playful savage. Not cruel about real people's bodies — punch the *choices* in the frame (outfit, pose, props).
- Headlines: short shots ("SIR.", "THE NERVE.", "NAH.", "CERTIFIED L", "POV: CHAOS")
- Kickers: one concrete visual jab ("…the cigarette is doing more work than the fit.")`;
    arcOverride = "SETUP → ESCALATE → DEEPEST ROAST → CALLBACK → SAVE/CTA";
  } else if (isComedy) {
    intentLabel = "comedy";
    toneGuidance = `THIS IS COMEDY CONTENT. Every scene should have a punchline or absurdist observation. No corporate speak. Write like you post memes.`;
  } else if (isMotivation) {
    intentLabel = "motivation";
    toneGuidance = `MOTIVATIONAL CONTENT. Raw, real, not corporate. Think early morning gym energy. Short punchy lines. Make the viewer feel it.`;
  } else if (isTutorial) {
    intentLabel = "tutorial";
    toneGuidance = `TUTORIAL FORMAT. Numbered steps, clear payoffs per scene. Kickers explain the "why" behind each step.`;
  } else if (isHype) {
    intentLabel = "hype";
    toneGuidance = `PURE HYPE. 1-3 ALL CAPS words per headline. Make every frame feel like a drop.`;
  }

  return { isRoast, isComedy, isMotivation, isTutorial, isHype, subjectName, intentLabel, toneGuidance, arcOverride };
}

function buildDirectorPrompt(
  userBrief: string,
  visionNotes: VisionNote[],
  attachmentOrder: { path: string; name: string }[] | null,
  aspect: string,
  creative: HyperframesCreativeProfile,
  targetSec: number,
  maxScenes: number,
  webContext?: string
): string {
  const intent = detectCreativeIntent(userBrief);
  const byPath = new Map(visionNotes.map((n) => [n.path, n]));

  const visionBlock =
    attachmentOrder && attachmentOrder.length > 0
      ? `\nImages — ${attachmentOrder.length} uploads. You MUST plan exactly ${attachmentOrder.length} scenes (one beat per image, same order — image 1 → scene index 0, etc.):\n${attachmentOrder
          .map((a, i) => {
            const n = byPath.get(a.path);
            const spatial = n?.composition ? ` | composition: ${n.composition}` : "";
            const zone = n?.text_zone ? ` | text_zone: ${n.text_zone}` : "";
            const ctype = n?.content_type ? ` | type: ${n.content_type}` : "";
            const cstyle = n?.copy_style ? ` | copy_style: ${n.copy_style}` : "";
            const pal = n?.palette?.length ? n.palette.slice(0, 3).join(", ") : "—";
            if (!n?.subject?.trim()) {
              return `  ${i + 1}. "${a.path}" (${a.name})\n     · vision thin — still write from visible cues (figure, clothes, setting). palette: ${pal}${spatial}${zone}${ctype}${cstyle}`;
            }
            return `  ${i + 1}. "${a.path}" (${a.name})\n     · subject: ${n.subject} | mood: ${n.mood || "—"} | palette: ${pal}${spatial}${zone}${ctype}${cstyle}`;
          })
          .join("\n")}`
      : visionNotes.length > 0
        ? `\nImages analyzed (${visionNotes.length} total):\n${visionNotes
            .map((n, i) => {
              const spatial = n.composition ? ` | composition: ${n.composition}` : "";
              const zone = n.text_zone ? ` | text_zone: ${n.text_zone}` : "";
              const ctype = n.content_type ? ` | type: ${n.content_type}` : "";
              const cstyle = n.copy_style ? ` | copy_style: ${n.copy_style}` : "";
              const sub = n.subject?.trim() || "(describe visible subject)";
              return `  ${i + 1}. ${sub} | mood: ${n.mood}${spatial}${zone}${ctype}${cstyle}`;
            })
            .join("\n")}`
        : "";

  const intentBlock = intent.toneGuidance
    ? `\n═══ CREATIVE INTENT: ${intent.intentLabel.toUpperCase()} ═══\n${intent.toneGuidance}\n`
    : "";

  const arcBlock = intent.arcOverride
    ? `\nNARRATIVE ARC: ${intent.arcOverride}\n`
    : "";

  const sceneCountRule =
    attachmentOrder && attachmentOrder.length > 0
      ? `EXACTLY ${attachmentOrder.length} scenes — one per uploaded image, in upload order. Not fewer.`
      : `Between 2 and ${maxScenes} scenes.`;

  return `${BRAIN_CREATIVE_DIRECTIVES}

You are a creative director. Plan a ${targetSec}s video in ${aspect}.
Brief: "${userBrief || "(derive concept from images below)"}"
Feel: ${creative.motionFeel} motion · ${creative.captionTone} copy · ${creative.transitionEnergy} energy · ${sceneCountRule}${visionBlock}
${webContext ? webContext : ""}
${intentBlock}${arcBlock}
Return ONE JSON only — no prose, no markdown:
{
  "title": "PascalCase ≤24 chars",
  "logline": "one sentence story",
  "hook": "exact first 2 seconds on screen",
  "palette": {"bg":"#hex","text":"#hex","accent":"#hex","secondary":"#hex"},
  "typography": {"headline_font":"Google Font","mono_font":"mono Google Font","style_note":"brief"},
  "motion_language": "e.g. weighted expo.out, no bounce",
  "overall_energy": "low|medium|high",
  "scenes": [{
    "index": 0,
    "layout": "hud|editorial|typographic|split|orbital|data-grid|full-bleed|glitch|magazine",
    "bg": "#hex or CSS gradient",
    "headline": "SPECIFIC headline for this scene — grounded in what the image shows — NEVER generic",
    "kicker": "mono label that expands on the headline with a specific detail",
    "body": "optional 1 sentence",
    "accent": "#hex",
    "primitives": ["HUDCorners","StarField","GridOverlay","KineticTitle","TelemetryCounter","StatusBar","DataReadout","ScanLines","LightLeak"],
    "transition": "fade|slide-left|slide-right|slide-top|slide-bottom|flip|wipe|iris|clock-wipe",
    "motion_note": "exact animation e.g. 'stagger 4fr/word, HUDCorners at frame 0'"
  }]
}

Rules: ${attachmentOrder && attachmentOrder.length > 0 ? `scenes array length MUST equal ${attachmentOrder.length} (one scene per image).` : `scenes 2–${maxScenes}.`} Headlines SPECIFIC to brief/images — derived from WHAT IS VISIBLE. Never generic travel-brand voice. Vary layouts. Match palette to mood.${intent.isRoast ? " ROAST: every headline = funny specific visual jab — zero startup jargon." : ""}
For ${creative.captionTone}: ${
    intent.isRoast ? "punchy savage observations — short, funny, specific to the photo" :
    creative.captionTone === "hype" ? "ALL-CAPS 1-4 word punches" :
    creative.captionTone === "corporate" ? "Title Case benefit lines" :
    creative.captionTone === "storytelling" ? "evocative cinematic fragments" :
    creative.captionTone === "tutorial" ? "step labels, numbered" : "scroll-stopping social hooks"
  }. Banned words/phrases: "revolutionary", "game-changing", "unlock", "elevate", "let's dive in", "deploy", "iterate", "throughput", "sprint", "PMF", "fail fast", "MVP", "refactor", "latency", "alignment", "stakeholder", "retro", "pipeline", "scale".`;
}

async function runBrainPass(
  userBrief: string,
  visionNotes: VisionNote[],
  attachmentOrder: { path: string; name: string }[] | null,
  aspect: string,
  creative: HyperframesCreativeProfile,
  targetSec: number,
  maxScenes: number
): Promise<{ concept: ConceptBrief; brief: DirectorBrief | null }> {
  // Fetch real-world context (design trends, domain vocabulary) to inject into the director brief.
  // This gives Gemma grounded copy ideas rather than generic filler. Fails silently if offline.
  const intentEarly = detectCreativeIntent(userBrief);
  const contentTypes = visionNotes.map((n) => n.content_type ?? "").filter(Boolean);
  const copyStyles = visionNotes.map((n) => n.copy_style ?? "").filter(Boolean);
  const webQueries = buildContextQueries(userBrief, contentTypes, copyStyles);
  const webContextItems = await fetchWebContext(webQueries);
  const webContext = formatWebContext(webContextItems, {
    isRoast: intentEarly.isRoast,
    captionTone: creative.captionTone,
    contentTypes,
  });

  const prompt = buildDirectorPrompt(
    userBrief,
    visionNotes,
    attachmentOrder,
    aspect,
    creative,
    targetSec,
    maxScenes,
    webContext
  );
  try {
    const raw = await callOllamaChat(
      [{ role: "user", content: prompt }],
      true
    );
    const parsed = safeJson(raw);
    const brief = parseDirectorBrief(parsed, maxScenes);
    if (brief) {
      return { concept: briefToConceptCompat(brief), brief };
    }
    // Fallback: try to salvage a minimal ConceptBrief if DirectorBrief parse fails
    const p = (parsed ?? {}) as Record<string, unknown>;
    if (p.title && p.logline) {
      const concept: ConceptBrief = {
        title: String(p.title),
        logline: String(p.logline),
        hook: typeof p.hook === "string" ? p.hook : "",
        color_story: typeof p.color_story === "string" ? p.color_story : "",
        typography_mood: typeof p.typography_mood === "string" ? p.typography_mood : "",
        motion_energy: typeof p.motion_energy === "string" ? p.motion_energy : "",
        scene_beats: Array.isArray(p.scene_beats) ? p.scene_beats.map(String) : [],
      };
      return { concept, brief: null };
    }
    return { concept: { title: "", logline: "", hook: "", color_story: "", typography_mood: "", motion_energy: "", scene_beats: [] }, brief: null };
  } catch {
    return { concept: { title: "", logline: "", hook: "", color_story: "", typography_mood: "", motion_energy: "", scene_beats: [] }, brief: null };
  }
}

async function describeImage(a: ImageStats, captionTone?: HyperframesCaptionTone): Promise<VisionNote> {
  const toneHint = captionTone
    ? `Copy tone is "${captionTone}" — note what mood/lighting supports it.`
    : "";
  const prompt = `You are an art director analyzing a photo for a social media video or slide. Look at this image carefully and respond with ONE JSON object:
{
  "subject":      string,   // WHAT is in the frame: specific objects, people, spaces — one concrete sentence
  "mood":         string,   // 1-3 words mood (e.g. "serene minimalist", "vibrant urban", "luxury warm")
  "palette":      string[], // 3 dominant hex colors extracted from the image
  "composition":  string,   // spatial description: where are subjects? e.g. "subject centered, dark edges", "person right-third, open sky left"
  "text_zone":    string,   // best placement for overlay text: "bottom-left" | "top-center" | "bottom-center" | "left-panel" | "right-panel" | "top-left" | "center"
  "content_type": string,   // image category: "interior-design" | "portrait" | "product" | "landscape" | "architecture" | "food" | "fashion" | "automotive" | "abstract" | "event"
  "copy_style":   string    // 3-5 words describing what TEXT on this image should feel like: e.g. "luxury lifestyle aspirational", "editorial fashion statement", "tech product minimal", "real estate premium"
}
${toneHint}
Rules: text_zone must be where there is OPEN SPACE or dark area in the image (avoid faces/focal subjects). Return ONLY the JSON.`;
  try {
    const raw = await callOllamaChat(
      [{ role: "user", content: prompt, images: [a.base64] }],
      true
    );
    const parsed = safeJson(raw) as Partial<VisionNote & { text_zone: string; content_type: string; copy_style: string; composition: string }> | null;
    const palette = Array.isArray(parsed?.palette)
      ? parsed!.palette
          .filter((h): h is string => typeof h === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h.trim()))
          .map((h) => h.trim())
          .slice(0, 4)
      : [];
    return {
      path: a.path,
      subject: typeof parsed?.subject === "string" ? parsed.subject.trim().slice(0, 220) : "",
      mood: typeof parsed?.mood === "string" ? parsed.mood.trim().slice(0, 40) : "",
      palette: palette.length ? palette : [a.dominant],
      brightness: a.brightness,
      composition: typeof parsed?.composition === "string" ? parsed.composition.trim().slice(0, 140) : undefined,
      text_zone: typeof parsed?.text_zone === "string" ? parsed.text_zone.trim().slice(0, 40) : undefined,
      content_type: typeof parsed?.content_type === "string" ? parsed.content_type.trim().slice(0, 40) : undefined,
      copy_style: typeof parsed?.copy_style === "string" ? parsed.copy_style.trim().slice(0, 80) : undefined,
    };
  } catch {
    return { path: a.path, subject: "", mood: "", palette: [a.dominant], brightness: a.brightness };
  }
}

/**
 * Max images per single Gemma vision call. Smaller chunks = fewer truncated `notes`
 * arrays from the model (fixes “only 2 of 6 thumbnails got vision text”).
 */
const VISION_CHUNK_SIZE = 3;

function extractVisionNote(p: Record<string, unknown> | null, a: ImageStats): VisionNote {
  if (!p) return { path: a.path, subject: "", mood: "", palette: [a.dominant], brightness: a.brightness };
  const palette = Array.isArray(p.palette)
    ? (p.palette as unknown[])
        .filter((h): h is string => typeof h === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h.trim()))
        .map((h) => (h as string).trim())
        .slice(0, 4)
    : [];
  return {
    path: a.path,
    subject: typeof p.subject === "string" ? p.subject.trim().slice(0, 220) : "",
    mood: typeof p.mood === "string" ? p.mood.trim().slice(0, 40) : "",
    palette: palette.length ? palette : [a.dominant],
    brightness: a.brightness,
    composition: typeof p.composition === "string" ? p.composition.trim().slice(0, 140) : undefined,
    text_zone: typeof p.text_zone === "string" ? p.text_zone.trim().slice(0, 40) : undefined,
    content_type: typeof p.content_type === "string" ? p.content_type.trim().slice(0, 40) : undefined,
    copy_style: typeof p.copy_style === "string" ? p.copy_style.trim().slice(0, 80) : undefined,
  };
}

function placeholderStats(path: string, name: string): ImageStats {
  return {
    path,
    name,
    width: 0,
    height: 0,
    dominant: "#444444",
    brightness: 0.45,
    base64: "",
  };
}

function isPlaceholderStats(a: ImageStats): boolean {
  return a.width === 0 && a.height === 0;
}

/** When sharp cannot decode a file, still produce a vision line so every thumbnail gets copy. */
async function describeUnreadableAttachment(path: string, name: string): Promise<VisionNote> {
  const stub = placeholderStats(path, name);
  const prompt = `No image pixels could be read from disk. Filename: "${name}". Relative path: "${path}".
Infer a plausible on-screen subject for a short-form video (dolls, puppets, plastic figures, toy cars, costumes, cigarettes/smoke, car windows, etc. if the filename hints at it).
Return ONLY JSON: {"subject":"one concrete sentence","mood":"2-4 words","palette":["#553322","#111111","#dddddd"],"composition":"assume subject centered","text_zone":"bottom-left","content_type":"fashion","copy_style":"cinematic miniature / toy figure"}`;

  try {
    const raw = await callOllamaChat([{ role: "user", content: prompt }], true);
    const parsed = safeJson(raw) as Record<string, unknown> | null;
    return extractVisionNote(parsed, stub);
  } catch {
    return {
      path,
      subject: `Could not read "${name}" — add a short description in your prompt or re-upload the file.`,
      mood: "",
      palette: [stub.dominant],
      brightness: stub.brightness,
    };
  }
}

/** Align sharp reads 1:1 with attachment list — never drop a slot (fixes partial vision UI). */
function analysesForAttachments(
  attachments: { path: string; name: string }[],
  results: (ImageStats | null)[]
): ImageStats[] {
  return attachments.map((a, i) => results[i] ?? placeholderStats(a.path, a.name));
}

/** Describe a single chunk (up to VISION_CHUNK_SIZE images) in one Gemma call. */
async function describeChunk(
  chunk: ImageStats[],
  captionTone?: HyperframesCaptionTone
): Promise<VisionNote[]> {
  const n = chunk.length;
  if (n === 0) return [];

  const out: VisionNote[] = new Array(n);
  const pixelIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isPlaceholderStats(chunk[i])) {
      out[i] = await describeUnreadableAttachment(chunk[i].path, chunk[i].name);
    } else {
      pixelIdx.push(i);
    }
  }
  if (pixelIdx.length === 0) return out;

  const pixelChunk = pixelIdx.map((i) => chunk[i]);
  const m = pixelChunk.length;
  const toneHint = captionTone ? `\nCopy tone: "${captionTone}".` : "";

  const prompt = `You are an art director. Analyze these ${m} photo(s) IN ORDER (image 1, image 2, …) and return a JSON object.

Return exactly: {"notes": [array of ${m} objects, one per photo in order]}

Each object must have:
{
  "subject":      "one concrete sentence — WHAT is in the frame",
  "mood":         "1-3 words",
  "palette":      ["#hex1","#hex2","#hex3"],
  "composition":  "spatial — e.g. person right-third, open sky left",
  "text_zone":    "bottom-left|top-center|bottom-center|left-panel|right-panel|top-left|center",
  "content_type": "interior-design|portrait|product|landscape|architecture|food|fashion|automotive|abstract|event",
  "copy_style":   "3-5 words e.g. luxury lifestyle aspirational"
}
text_zone = where open space or dark area exists (avoid focal subjects/faces).${toneHint}
The "notes" array MUST have exactly ${m} entries — same count as images. No merging, no skipping.
Return ONLY the JSON. No prose.`;

  const run = async (): Promise<VisionNote[]> => {
    const raw = await callOllamaChat(
      [{ role: "user", content: prompt, images: pixelChunk.map((a) => a.base64) }],
      true
    );
    const parsed = safeJson(raw) as Record<string, unknown> | null;
    const notes = Array.isArray(parsed?.notes) ? (parsed!.notes as Record<string, unknown>[]) : null;
    return pixelChunk.map((a, i) => extractVisionNote((notes?.[i] ?? null) as Record<string, unknown> | null, a));
  };

  try {
    let sub = await run();
    let thin = sub.map((note, j) => (!note.subject?.trim() ? j : -1)).filter((j) => j >= 0);
    if (thin.length > 0 && m > 1) {
      sub = await run();
    }
    thin = sub.map((note, j) => (!note.subject?.trim() ? j : -1)).filter((j) => j >= 0);
    for (const j of thin) {
      try {
        const one = await describeChunk([pixelChunk[j]], captionTone);
        sub[j] = one[0] ?? sub[j];
      } catch {
        /* keep thin */
      }
    }
    pixelIdx.forEach((orig, j) => {
      out[orig] = sub[j];
    });
    return out;
  } catch {
    pixelIdx.forEach((orig) => {
      const a = chunk[orig];
      out[orig] = { path: a.path, subject: "", mood: "", palette: [a.dominant], brightness: a.brightness };
    });
    return out;
  }
}

/**
 * Describe ALL images, chunked into groups of VISION_CHUNK_SIZE to avoid
 * overloading the model's context. Results are merged back in original order.
 */
async function describeImagesBatch(
  analyses: ImageStats[],
  captionTone?: HyperframesCaptionTone
): Promise<VisionNote[]> {
  if (analyses.length === 0) return [];

  // Build chunks
  const chunks: ImageStats[][] = [];
  for (let i = 0; i < analyses.length; i += VISION_CHUNK_SIZE) {
    chunks.push(analyses.slice(i, i + VISION_CHUNK_SIZE));
  }

  // Process chunks sequentially to avoid saturating Ollama
  const results: VisionNote[] = [];
  for (const chunk of chunks) {
    const notes = await describeChunk(chunk, captionTone);
    results.push(...notes);
  }
  return results;
}

function safeJson(raw: string): unknown | null {
  // Strip <think>…</think> blocks — Gemma 4 sometimes wraps its reasoning around the JSON.
  // Also strip markdown code fences (```json … ```) that Gemma may output before the object.
  const clean = raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();

  try { return JSON.parse(clean); } catch { /* fall through */ }
  // Last-resort: find first '{' to last '}' in cleaned string
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(clean.slice(first, last + 1)); } catch { return null; }
  }
  return null;
}

const VALID_TRANSITIONS = [
  "slide-right",
  "slide-left",
  "slide-top",
  "slide-bottom",
  "flip",
  "fade",
  "wipe",
  "wipe-right",
  "wipe-bottom",
  "clock-wipe",
  "iris",
] as const;
type Transition = (typeof VALID_TRANSITIONS)[number];

interface ReelScene {
  src: string;
  caption: string;
  kicker?: string;
  accent?: string;
  transition?: Transition;
  narration?: string;
}

interface ReelSpec {
  title?: string;
  brandName?: string;
  scenes: ReelScene[];
}

function buildReelPrompt(
  userRequest: string,
  attachments: { path: string; name: string }[],
  visionNotes: VisionNote[],
  aspect: Aspect,
  pace: Pace,
  maxScenes: number,
  creative: HyperframesCreativeProfile,
  targetDurationSec: number,
  brief?: DirectorBrief | null
): string {
  const { captionMax, kickerMax } = copyLimitsForDuration(targetDurationSec);
  // Build an enriched image manifest that folds in vision findings (subject,
  // mood, palette) so Gemma picks copy grounded in what's actually on screen.
  const byPath = new Map(visionNotes.map((n) => [n.path, n]));
  const imgList = attachments
    .map((a, i) => {
      const note = byPath.get(a.path);
      if (!note || !note.subject) {
        return `  ${i + 1}. "${a.path}"   (${a.name})`;
      }
      const paletteStr = note.palette.slice(0, 3).join(", ");
      const brightTag = note.brightness > 0.6 ? "bright" : note.brightness < 0.35 ? "moody-dark" : "mid-tone";
      const spatialLine = note.composition ? `\n       · composition: ${note.composition}` : "";
      const zoneLine = note.text_zone ? `\n       · text_zone: ${note.text_zone} ← place headline/kicker here` : "";
      const typeLine = note.content_type ? `\n       · content_type: ${note.content_type}` : "";
      const copyLine = note.copy_style ? `\n       · copy_style: ${note.copy_style}` : "";
      return `  ${i + 1}. "${a.path}"   (${a.name})
       · subject : ${note.subject}
       · mood    : ${note.mood || "—"} · ${brightTag}
       · palette : ${paletteStr || "—"}${spatialLine}${zoneLine}${typeLine}${copyLine}`;
    })
    .join("\n");

  const transitionList = VALID_TRANSITIONS.map((t) => `"${t}"`).join(" | ");
  const aspectMeta = ASPECTS[aspect];
  const paceMeta = PACE[pace];
  const creativeBlock = buildHyperframesCreativeBlock(creative);

  // Map caption tone to platform (best match for cultural context)
  const platformForTone: Record<string, Platform> = {
    hype: "instagram",
    social: "tiktok",
    corporate: "linkedin",
    tutorial: "x",
    storytelling: "instagram",
  };
  const platform: Platform = platformForTone[creative.captionTone ?? "social"] ?? "instagram";
  const contentTypes = visionNotes.flatMap((n) => (n.content_type ? [n.content_type] : []));
  const copyStyles = visionNotes.flatMap((n) => (n.copy_style ? [n.copy_style] : []));
  const culturalBlock = buildCulturalContext({
    brief: userRequest,
    platform,
    captionTone: (creative.captionTone ?? "social") as Parameters<typeof buildCulturalContext>[0]["captionTone"],
    contentTypes,
    copyStyles,
  });

  // Build accent suggestion block from image palettes — helps Gemma pick on-image colors
  const accentSuggestions = visionNotes
    .filter((n) => n.palette.length > 0)
    .slice(0, attachments.length)
    .map((n, i) => {
      const top = n.palette.slice(0, 3);
      return `  Image ${i + 1}: dominant palette [${top.join(", ")}] → suggest accent from these`;
    })
    .join("\n");
  const colorBlock = accentSuggestions
    ? `═══ ACCENT COLOR GUIDE ═══\nMatch accent hex to the image's dominant palette — not a random color:\n${accentSuggestions}\n`
    : "";

  const intent = detectCreativeIntent(userRequest);
  const intentRuleBlock = intent.toneGuidance
    ? `\n═══ CREATIVE INTENT: ${intent.intentLabel.toUpperCase()} ═══\n${intent.toneGuidance}\n`
    : "";
  const intentArcOverride = intent.arcOverride ?? null;

  /** Always 1:1 with uploads so Gemma cannot "remix" duplicate paths unless the user removes images. */
  const oneScenePerImage = attachments.length > 0;
  const sceneCountRule = oneScenePerImage
    ? `EXACTLY ${attachments.length} — one scene per uploaded image, preserve list order, each "src" appears once`
    : `2 to ${maxScenes}`;

  const criticalRules = `CRITICAL RULES (read before schema):
- Every scene.src MUST be copied letter-for-letter from the image list below — no paraphrasing
- scenes.length: ${sceneCountRule}
- caption ≤${captionMax} chars · kicker ≤${kickerMax} chars
- Vary transitions scene-to-scene — no two in a row the same
- Caption must reference what's IN that image (from subject/mood below) — never generic${intent.isRoast ? "\n- THIS IS A ROAST: every caption = specific funny observation about what's visible in THAT image" : ""}
`;
  const remixBlock = buildReelRemixDirective(attachments.length, maxScenes, {
    oneScenePerImage,
  });
  const longForm = targetDurationSec >= 45;
  const lingoBlock = `═══ TARGET RUNTIME: ${targetDurationSec} seconds (~${targetDurationSec * 30} frames @ 30fps) ═══
Scene holds will be tuned to fill this length. Write copy that earns the full runtime:
- Social-native voice when tone is hype/social: hooks that sound like Reels/TikTok/Shorts (e.g. "POV:", "wait for it", "save this", "link in bio") only when on-brand — no empty filler.
- Corporate/tutorial: crisp value props and step cues — still scannable on mobile.
- ${longForm ? `LONG RUN (${targetDurationSec}s): use the full kicker budget (≤${kickerMax} chars) for story beats, curiosity, payoff; vary phrasing scene-to-scene.` : `Short run: captions stay razor-tight; kicker optional.`}
`;

  // Narrative arc — from video-use production methodology.
  // Map caption tone to the correct arc shape so every reel has story structure.
  const narrativeArcMap: Record<string, string> = {
    hype:         "HOOK → TENSION → REVEAL → PAYOFF → CTA",
    social:       "HOOK → PROOF → MOMENT → CTA",
    corporate:    "PROBLEM → SOLUTION → BENEFIT → EXAMPLE → CTA",
    tutorial:     "INTRO → STEP 1 → STEP 2 → RESULT → CTA",
    storytelling: "INCITING MOMENT → RISING ACTION → CLIMAX → RESOLUTION → CTA",
  };
  const arc = narrativeArcMap[creative.captionTone ?? "social"] ?? "HOOK → PROOF → PAYOFF → CTA";
  const narrativeBlock = `═══ NARRATIVE ARC (mandatory — every reel needs story structure) ═══
Arc for this tone (${creative.captionTone}): ${arc}
- Scene 1 = HOOK: stop-the-scroll. Most visually arresting image. Shortest caption. No context yet.
- Middle scenes = BUILD: proof, conflict, transformation, the "how" or "why"
- Last scene = PAYOFF/CTA: resolution or call to action. Caption feels earned by what came before.
- Each scene's copy must feel like the NEXT LINE in a conversation — not a random thought.
Distribute your scenes across this arc. Don't make every scene feel the same.
`;

  // Director brief block — pre-planned copy from the brain pass. When present,
  // Gemma must use the EXACT headline/kicker/accent per scene index (not invent new).
  const directorBlock = brief?.scenes.length
    ? intent.isRoast
      ? `═══ DIRECTOR BRIEF — roast beats (one per scene). ═══
${brief.scenes.slice(0, maxScenes).map((s, i) =>
  `  Scene ${i + 1}: headline="${s.headline}" | kicker="${s.kicker}" | accent="${s.accent}"`
).join("\n")}

RULE: Treat each line as a BEAT, not final copy. Paste into JSON only after ensuring it is (a) a specific visual roast of THAT photo, (b) free of startup/motivation jargon. Rewrite any weak or corporate-sounding line — keep the joke structure but make it meaner and more literal about what's on screen. Match scene index to image order (scene 1 → first image path, etc.).
`
      : `═══ DIRECTOR BRIEF — copy approved. Use verbatim. ═══
${brief.scenes.slice(0, maxScenes).map((s, i) =>
  `  Scene ${i + 1}: caption="${s.headline}" | kicker="${s.kicker}" | accent="${s.accent}"`
).join("\n")}

STRICT RULE: The caption and kicker above are APPROVED copy — paste them verbatim into the JSON. Do NOT invent new captions. You may still choose the src (image path) and transition freely.
`
    : "";

  // Override narrative arc if intent detection says so
  const finalNarrativeBlock = intentArcOverride
    ? `═══ NARRATIVE ARC (mandatory) ═══\nArc for this content: ${intentArcOverride}\n- Scene 1 = opener/hook\n- Middle scenes = escalation\n- Last scene = biggest punchline or CTA\n`
    : narrativeBlock;

  return `${GEMMA_JSON_CREATIVE_DIRECTIVES}

You are a video art director generating a JSON scene plan for a ${aspectMeta.label} reel.
Pace: ${pace.toUpperCase()} — ${paceMeta.blurb}.

${creativeBlock}
${intentRuleBlock}
${culturalBlock}

${finalNarrativeBlock}
${colorBlock}
${criticalRules}
${remixBlock}
${lingoBlock}
${directorBlock}═══ OUTPUT CONTRACT ═══
Respond with ONE \`\`\`json fenced code block and absolutely nothing else.
NO prose, NO markdown headings, NO explanations, NO trailing comments.
The JSON must parse with JSON.parse().

═══ SCHEMA ═══
{
  "title":      string    (optional, PascalCase, <= 24 chars, e.g. "NightDrive"),
  "brandName":  string    (optional, defaults to "VISIO●REEL"),
  "scenes": [
    {
      "src":        string   (REQUIRED, must be EXACTLY one of the image paths listed below),
      "caption":    string   (REQUIRED, headline text — max ${captionMax} chars; hype/social: often 1–3 ALL-CAPS words OR a short punchy phrase; corporate: Title Case benefit line),
      "kicker":     string   (optional, supporting line — max ${kickerMax} chars; lowercase or sentence case per tone; for ${targetDurationSec}s+ make it a satisfying beat, not filler),
      "accent":     string   (optional, hex color matching the image mood, e.g. "#ff3d3d"),
      "transition": ${transitionList}   (optional),
      "narration":  string   (optional — natural spoken version of this scene for TTS, 1-2 sentences, no hashtags)
    }
  ]
}

═══ AVAILABLE IMAGES (use these EXACT strings in "src") ═══
${imgList}

═══ RULES ═══
- scenes.length: ${oneScenePerImage ? `must be EXACTLY ${attachments.length} (see REMIX / one-per-image block)` : `between 2 and ${maxScenes} (remix: same src may repeat — see REMIX block)`}
- Every scene.src MUST be one of the paths above — copied letter-for-letter (repeats allowed)
- Captions MUST stay grounded in the subject/mood of that image when it appears — never generic; when an image repeats, change the angle (hook vs proof vs CTA)
- Caption + kicker MUST follow the CREATIVE DIRECTIVE caption tone above (hype vs corporate vs tutorial vs storytelling vs social).
- ONE powerful word beats two when tone is hype/social and runtime is short; for longer runtimes, richer headlines are OK within caption char limit.
- Kicker amplifies the caption (≤${kickerMax} chars) — poetic or punchy per tone; for corporate, a clean subtitle line.
- Accent should match the photograph's dominant mood (use the palette hints above if helpful):
    action / fire    → #ff3d3d, #ff8a2a
    warmth / gold    → #ffd43a, #ffb72a
    nature / growth  → #54d38f, #6cd97a
    sky / water      → #4cc9ff, #8ab4ff
    magic / twilight → #a78bfa, #ff6fb5
- Transition kinds suit pacing: slide-* = kinetic, flip = reveal, wipe/wipe-right/wipe-bottom = punchy, clock-wipe = dramatic circular sweep, iris = cinematic spotlight reveal, fade = calm
- Vary transitions scene-to-scene; avoid using the same one twice in a row
- For ${pace.toUpperCase()} pace, prefer: ${
    pace === "hype"   ? "slide-*, wipe (kinetic cuts)"
  : pace === "fast"   ? "slide-*, flip, wipe"
  : pace === "chill"  ? "fade, slide-bottom (slow reveals)"
  :                     "a mix — lean on fades + slides"
}

═══ USER REQUEST ═══
${(() => {
  const t = userRequest.trim();
  if (t) return t;
  return `The user did NOT type a separate written brief — they attached images only.
Your job: invent a cohesive on-brand reel using ONLY the image list and vision subject/mood/palette above.
Treat each scene caption + kicker as grounded in that frame's subject line — no generic filler.
Still follow the CREATIVE DIRECTIVE (caption tone, motion feel, transitions).`;
})()}

Now produce the JSON.
`;
}

function extractJson(response: string): string | null {
  const fenced = response.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // fallback: first brace to matching close (greedy)
  const first = response.indexOf("{");
  const last = response.lastIndexOf("}");
  if (first >= 0 && last > first) return response.slice(first, last + 1);
  return null;
}

function htmlSlideTiming(pace: Pace): { sceneLen: number; transLen: number } {
  switch (pace) {
    case "chill":
      return { sceneLen: 110, transLen: 24 };
    case "fast":
      return { sceneLen: 55, transLen: 12 };
    case "hype":
      return { sceneLen: 38, transLen: 8 };
    default:
      return { sceneLen: 90, transLen: 12 };
  }
}

function extractHtmlSlidesArray(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const slides = (raw as Record<string, unknown>).slides;
  if (!Array.isArray(slides)) return [];
  return slides
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, 12);
}

/** Strip a single outer ``` / ```html fence if the model wrapped everything. */
function stripOuterCodeFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:html|xml|plaintext|text)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (m) return m[1].trim();
  return t;
}

/**
 * Prefer delimiter format (no JSON) — HTML in JSON breaks easily due to quotes and `}` in CSS.
 * Fallback: JSON {"slides":[...]} if present and parseable.
 */
function parseHtmlSlidesFromGemma(fullResponse: string): string[] {
  const stripped = stripOuterCodeFence(fullResponse);
  const parts = stripped
    .split(/\s*---SLIDE---\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length >= 2) {
    return parts.slice(0, 12);
  }

  if (parts.length === 1) {
    const one = parts[0];
    const t = one.trim();
    if (t.startsWith("{")) {
      try {
        const fromJson = extractHtmlSlidesArray(JSON.parse(t));
        if (fromJson.length) return fromJson;
      } catch {
        /* try brace extraction */
      }
      const jsonStr = extractJson(stripped);
      if (jsonStr) {
        try {
          const fromJson = extractHtmlSlidesArray(JSON.parse(jsonStr));
          if (fromJson.length) return fromJson;
        } catch {
          /* ignore */
        }
      }
    } else if (t.includes("<")) {
      return [one];
    }
  }

  const jsonStr = extractJson(stripped);
  if (jsonStr) {
    try {
      const fromJson = extractHtmlSlidesArray(JSON.parse(jsonStr));
      if (fromJson.length) return fromJson;
    } catch {
      /* ignore */
    }
  }

  return [];
}

/** When director brief has fewer scenes than rendered HTML slides, derive a spoken line from slide HTML. */
function extractNarrationFallbackFromSlideHtml(html: string): string {
  const oneLine = html.replace(/\s+/g, " ");
  const heading = oneLine.match(/<h[1-3][^>]*>([^<]{1,220})/i);
  if (heading?.[1]?.trim()) return heading[1].trim().slice(0, 220);
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (stripped || "This slide.").slice(0, 280);
}

function buildHtmlSlidesPrompt(
  userRequest: string,
  w: number,
  h: number,
  maxSlides: number,
  creative: HyperframesCreativeProfile,
  targetSec: number,
  attachments: { path: string; name: string }[],
  visionNotes: VisionNote[],
  brief?: DirectorBrief | null
): string {
  const byPath = new Map(visionNotes.map((n) => [n.path, n]));
  const slideIntent = detectCreativeIntent(userRequest);
  const imgBlock =
    attachments.length === 0
      ? ""
      : `═══ UPLOADED IMAGES — YOU MUST SHOW THEM ON-SCREEN ═══
These files are the full-resolution assets on disk. Use each EXACT \`src\` below (relative path, NO leading slash — e.g. \`uploads/abc.jpg\`, NOT \`/uploads/...\`).

${attachments
  .map((a, i) => {
    const note = byPath.get(a.path);
    const safeAlt = a.name.replace(/"/g, "'");
    if (!note || !note.subject) {
      return `  ${i + 1}. REQUIRED src="${a.path}"   (${a.name})`;
    }
    const paletteStr = note.palette.slice(0, 3).join(", ");
    const brightTag =
      note.brightness > 0.6 ? "bright" : note.brightness < 0.35 ? "moody-dark" : "mid-tone";
    const spatialLine = note.composition ? `\n       · composition: ${note.composition}` : "";
    const zoneLine = note.text_zone ? `\n       · text_zone: ${note.text_zone} ← anchor your headline/kicker here` : "";
    const typeLine = note.content_type ? `\n       · content_type: ${note.content_type}` : "";
    const copyLine = note.copy_style ? `\n       · copy_style: ${note.copy_style}` : "";
    return `  ${i + 1}. REQUIRED src="${a.path}"   (${a.name})
       · subject : ${note.subject}
       · mood    : ${note.mood || "—"} · ${brightTag}
       · palette : ${paletteStr || "—"}${spatialLine}${zoneLine}${typeLine}${copyLine}`;
  })
  .join("\n")}

- **Layout (mandatory for any slide that uses a photo):** full-bleed image + readable type.
  Structure: \`<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;box-sizing:border-box;">\`
  (1) \`<img src="…" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;"/>\`
  (2) Gradient scrim: ALWAYS add \`<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.4) 40%,transparent 70%);pointer-events:none;"></div>\`
  (3) Text block: ALWAYS position at BOTTOM — \`position:absolute;bottom:0;left:0;right:0;padding:6% 8% 7%;\` — NEVER top-left, NEVER absolute top
  (4) Text color on photos: ALWAYS white (#fff) or near-white (#f8f8f8) — the scrim ensures contrast
  (4b) Kicker: small mono label above headline, accent color, 0.2em letter-spacing, uppercase
  (5) Optional: corner HUD brackets, thin 1px rule above kicker
- Text placement MUST follow text_zone intent but ANCHORED TO BOTTOM of the frame — never floating over the subject's face
- For text_zone=top-center or top-left: use a top-to-bottom scrim and position text at TOP with padding-top:8%
- Use each listed image at least once. No placeholder-only slides.
- TEXT CONTRAST LAW: Never render white text without the gradient scrim. Never render black text on a dark photo.

`;

  const briefBlock = (() => {
    const t = userRequest.trim();
    if (t) return `═══ USER BRIEF ═══\n${t}`;
    if (attachments.length > 0) {
      return `═══ USER BRIEF ═══
The user did NOT type a separate written brief — they attached images only.
Invent a cohesive slide sequence: hooks, captions, and supporting copy driven by the vision subject/mood lines above. No generic filler — stay specific to what's in each frame.`;
    }
    return `═══ USER BRIEF ═══\nFollow the creative directive above.`;
  })();

  // Director brief block — injects the pre-planned scene specs so Gemma executes, not invents
  const directorHtmlBlock = brief ? (() => {
    const sceneLines = brief.scenes.slice(0, maxSlides).map((s, i) => {
      const dataLine = s.data_points?.length
        ? `\n     · data overlays: ${s.data_points.map(d => `${d.label} ${d.value}${d.unit ?? ""}`).join(" · ")}`
        : "";
      return `  Slide ${i + 1} [${s.layout}]:
     · headline: "${s.headline}"
     · kicker: "${s.kicker}"${s.body ? `\n     · body: "${s.body}"` : ""}
     · bg: ${s.bg}
     · accent: ${s.accent}${s.secondary ? ` · secondary: ${s.secondary}` : ""}${dataLine}
     · motion_note: ${s.motion_note}`;
    }).join("\n\n");
    const roastHtmlRules = slideIntent.isRoast || slideIntent.isComedy
      ? `EXECUTION RULES (ROAST / COMEDY):
- Treat each headline/kicker as a comedy BEAT. Rewrite any line that sounds corporate, motivational, LinkedIn, or fake "mission control" (STATUS:, PROTOCOL:, CORE DIRECTIVE, deployment metaphors).
- Stay literal about what shows in the photo (outfit, doll/plastic look, car interior, cigarette, hair, expression).
- Match bg/accent per slide. Headline font at strong display sizes.
- Each slide visually distinct — vary layout and type scale.
`
      : `EXECUTION RULES:
- Use the EXACT headline and kicker text from each slide spec above — do not paraphrase
- Match the bg and accent hex values per slide
- For "hud" or "data-grid" layouts: render data overlays as styled <div> blocks with the mono font + accent color — e.g. a metric label in small-caps + large numeric value
- For "typographic" or "editorial": large display type contrast is the hero; use the headline font at 120px+
- For "magazine": thin horizontal rules, small-caps metadata labels, structured grid
- Each slide must have distinct visual identity — vary layout, type scale, and color emphasis
`;
    return `═══ DIRECTOR BRIEF — ${slideIntent.isRoast ? "roast beats (execute with comedic specificity)" : "execute these slide specs exactly"} ═══
Palette: bg=${brief.palette.bg} · text=${brief.palette.text} · accent=${brief.palette.accent}
Headline font: ${brief.typography.headline_font} · Mono font: ${brief.typography.mono_font}
Motion language: ${brief.motion_language}

${sceneLines}

${roastHtmlRules}`;
  })() : "";

  // Cultural context for HTML slides — same platform detection as reel
  const slidePlatformMap: Record<string, Platform> = {
    hype: "instagram", social: "tiktok", corporate: "linkedin",
    tutorial: "x", storytelling: "instagram",
  };
  const slidePlatform: Platform = slidePlatformMap[creative.captionTone ?? "social"] ?? "instagram";
  const contentTypesForSlide = visionNotes.flatMap((n) => (n.content_type ? [n.content_type] : []));
  const copyStylesForSlide = visionNotes.flatMap((n) => (n.copy_style ? [n.copy_style] : []));
  const slideCulturalBlock = buildCulturalContext({
    brief: userRequest,
    platform: slidePlatform,
    captionTone: (creative.captionTone ?? "social") as Parameters<typeof buildCulturalContext>[0]["captionTone"],
    contentTypes: contentTypesForSlide,
    copyStyles: copyStylesForSlide,
  });

  return `${HTML_SLIDES_CREATIVE_DIRECTIVES}

You are a senior motion designer + art director. The user wants a video made of separate HTML slides, each rendered as a PNG (${w}×${h}px).
${slideIntent.toneGuidance ? `\n═══ CREATIVE INTENT ═══\n${slideIntent.toneGuidance}\n` : ""}
Each slide = ONE self-contained HTML fragment (body content only — no <!DOCTYPE>). Use inline styles on a single root wrapper. CSS <style> blocks allowed (for @keyframes animations). No external JavaScript.

═══ TYPOGRAPHY (Google Fonts — REQUIRED on every slide with visible text) ═══
At the **very start** of each slide’s HTML, add the Google Fonts link:
\`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=FontName:ital,wght@0,400;0,700;0,900;1,400&display=swap" />\`
${brief ? `Use "${brief.typography.headline_font}" for headlines and "${brief.typography.mono_font}" for labels/kickers — these are the director-specified fonts.` : `Pick intentional display families: Bebas Neue, Fraunces, Syne, Space Grotesk, DM Mono, JetBrains Mono.`}

CSS @keyframes in a <style> tag are fully supported — use them for: fade-in, slide-up, scale-in, letter-spacing expand, opacity pulses. Animate them with animation: name 0.6s ease forwards.

═══ VISUAL LAYERS — every slide MUST have all three ═══
1. BACKGROUND LAYER: full-bleed gradient, dark field, or image — never flat #000 alone
   - Space/tech: linear-gradient(135deg, #05070D 0%, #0B1426 60%, #0D1F3C 100%)
   - Editorial: linen/cream #F5F0E8 with subtle texture via repeating-linear-gradient
   - Neon: radial-gradient at accent color from center, dark edges
2. STRUCTURE LAYER: geometric framing — rules, brackets, SVG — not a fake server dashboard
   - Thin 1px horizontal rules (top + bottom of text zone)
   - Corner brackets via border on positioned divs (editorial / film title vibe — not "incident room" cosplay)
   - SVG grid, arc, circle, or orbital path
   - Optional on-story "stats" only if they match the actual narrative (chapter 02 / 08, time, mood) — never DevOps filler strings
3. TYPOGRAPHY LAYER: intentional scale contrast
   - Dominant headline: 100-180px, tight tracking (-0.03em to -0.05em), bold weight
   - Kicker/label: 13-18px, 0.2em letter-spacing, uppercase, 55% opacity, mono font
   - Supporting copy: 22-28px, readable weight, 1.4-1.6 line-height
   - Each slide's headline should also work as a spoken sentence (no abbreviations, no ALL-CAPS acronyms that don't read naturally)

═══ LAYOUT PATTERNS (pick one per slide, vary across the deck) ═══
- EDITORIAL: large headline top-left, thin rule below, small kicker left-aligned, whitespace dominant
- HUD/DATA: dark bg, corner brackets, 2-4 on-story blocks (scene #, mood word, time) — never "STATUS:", "PROTOCOL:", "// CORE DIRECTIVE", deployment, or anti-performance joke labels
- MAGAZINE: cream bg, black type, thin rules framing sections, page number bottom-right
- SPLIT: left 55% image or gradient, right 45% text panel with solid bg
- TYPOGRAPHIC: headline fills 70% of slide, contrasting italic or weight shift on key word
- CINEMATIC: full-bleed gradient, centered headline with glow, thin ornamental line

HyperFrames shader vocabulary (inspire visual language — these are the transition moods):
domain-warp · ridged-burn · whip-pan · sdf-iris · ripple-waves · gravitational-lens ·
cinematic-zoom · chromatic-split · glitch · swirl-vortex · thermal-distortion · flash-through-white · cross-warp-morph · light-leak

${slideCulturalBlock}

═══ NARRATIVE ARC — every deck needs story structure ═══
${{
    hype:         "HOOK → TENSION → REVEAL → PAYOFF → CTA",
    social:       "HOOK → PROOF → MOMENT → CTA",
    corporate:    "PROBLEM → SOLUTION → BENEFIT → EXAMPLE → CTA",
    tutorial:     "INTRO → STEP 1 → STEP 2 → RESULT → CTA",
    storytelling: "INCITING MOMENT → RISING → CLIMAX → RESOLUTION → CTA",
  }[creative.captionTone ?? "social"] ?? "HOOK → PROOF → PAYOFF → CTA"}
Slide 1 = HOOK (stop-scroll, no context dump). Last slide = payoff/CTA. Middle = build.
Each slide's copy is the next line in the same story — not a disconnected random thought.

CREATIVE DIRECTIVE:
- Motion feel: ${creative.motionFeel}
- Caption / copy tone: ${creative.captionTone}
- Target vibe: ~${targetSec}s total.

VISUAL RICHNESS — each slide must have at least 3 layers:
1. Background: gradient or full-bleed image — never flat solid unless brief demands it
2. Structural elements: thin rules (1px), corner brackets (via border), SVG geometry, grid lines, or a gradient band
3. Typography: headline at display size + mono label/kicker in contrasting scale
For "hud" / "data-grid" slides: mono labels must read like a magazine / film poster (01 / 06, ACT III, MIDNIGHT) — not SaaS metrics, not SRE cosplay.

═══ BANNED VISIBLE COPY (do not put these in HTML text nodes) ═══
- Lines starting with // or mimicking code comments as kicker "labels"
- CORE DIRECTIVE, DEPLOYMENT FAILURE, ANTI-PERFORMANCE, PERFORMANCE CHECK, fake STATUS:/PROTOCOL:/SEVERITY: lines
- deploy, deployment, ship, sprint, throughput, "don't miss the next…", incident-room clichés
- If you need a small mono kicker, use scene index, mood, place, or a literal story beat from the brief/photos

${imgBlock}${directorHtmlBlock}
═══ OUTPUT FORMAT (do NOT use JSON — HTML breaks JSON parsers) ═══

1. Output slide 1 as raw HTML.
2. On its own line, exactly: ---SLIDE---
3. Output slide 2, then ---SLIDE---, repeat.
4. Up to ${maxSlides} slides.
5. No markdown code fences around the whole output.
6. Keep each slide compact but visually complete.

${briefBlock}

Now output the slides using ---SLIDE--- separators only.`;
}

/** Startup / productivity voice — forbidden when user asked for a roast or comedy burn. */
const ROAST_JARGON_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bship(?:ping)?\s+it\b/i, label: "ship it" },
  { re: /\bdeploy(?:ment|s)?\b/i, label: "deploy" },
  { re: /\blogout\b|\blog\s+out\b/i, label: "logout" },
  { re: /\bsprint\b/i, label: "sprint" },
  { re: /\brefactor\w*\b/i, label: "refactor" },
  { re: /\bfirmware\b/i, label: "firmware" },
  { re: /\bdeprecated\b/i, label: "deprecated" },
  { re: /\bbuffering\b/i, label: "buffering" },
  { re: /\bmetrics\b/i, label: "metrics" },
  { re: /\bversion\s*1[.,]?\s*0\b|\bv1(\.\d+)?\b/i, label: "v1.0" },
  { re: /\bfail\s+fast\b/i, label: "fail fast" },
  { re: /\b\d{4}\s+stack\b/i, label: "year stack" },
  { re: /\bdon't\s+miss\s+the\s+next\b/i, label: "engagement bait" },
  { re: /\biterate\b/i, label: "iterate" },
  { re: /\bthroughput\b/i, label: "throughput" },
  { re: /\bback\s+to\s+(?:the\s+)?stack\b/i, label: "stack" },
  { re: /\btech\s+stack\b/i, label: "stack" },
  { re: /\bPMF\b/i, label: "PMF" },
  { re: /product[-– ]market\b/i, label: "product-market" },
  { re: /\bsimulation\b/i, label: "simulation" },
  { re: /\bhard\s+reboot\b/i, label: "reboot" },
  { re: /\bMVP\b/i, label: "MVP" },
  { re: /\blatency\b/i, label: "latency" },
  { re: /\bstakeholder/i, label: "stakeholder" },
  { re: /\bretro\b/i, label: "retro" },
  { re: /\bbuild[,.]?\s*deploy\b/i, label: "build/deploy" },
  { re: /\bown\s+the\s+week\b/i, label: "hustle cliché" },
  { re: /\bbest\s+version\s+deploy/i, label: "deploy metaphor" },
  { re: /\bkickstart\b/i, label: "kickstart" },
  { re: /\bencore\b/i, label: "encore" },
  { re: /\bcurtain\s+calls?\b/i, label: "curtain call" },
];

function findRoastJargonInText(text: string): string[] {
  const hits: string[] = [];
  for (const { re, label } of ROAST_JARGON_PATTERNS) {
    if (re.test(text)) hits.push(label);
  }
  return [...new Set(hits)];
}

/** Faux SRE / incident-room labels pasted into HTML mono kickers (Hyperframes). */
const HYPERFRAMES_DEVOPS_COSPLAY: Array<{ re: RegExp; label: string }> = [
  { re: /\/\/\s*core\s+directive/i, label: "core directive" },
  { re: /\bcore\s+directive\b/i, label: "core directive" },
  { re: /\bdeployment\s+failure\b/i, label: "deployment failure" },
  { re: /\banti[-\s]?performance\b/i, label: "anti-performance" },
  { re: /\bperformance\s+check\b/i, label: "performance check" },
  {
    re: /\bstatus\s*:\s*(unfiltered|anti|deploy|online|offline|standby|severity|protocol|failure)/i,
    label: "fake STATUS line",
  },
  {
    re: /\bprotocol\s*:\s*(deconstruct|recon|deploy|decode|override|abort|init)/i,
    label: "protocol HUD",
  },
  { re: /\bseverity\s*:\s*\d+/i, label: "severity cosplay" },
  { re: /\bincident\s*(?:#\s*)?\d+/i, label: "incident cosplay" },
];

function htmlSlideVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findHyperframesBannedCopy(html: string): string[] {
  const text = htmlSlideVisibleText(html);
  const hits = [...findRoastJargonInText(text)];
  for (const { re, label } of HYPERFRAMES_DEVOPS_COSPLAY) {
    if (re.test(text)) hits.push(label);
  }
  return [...new Set(hits)];
}

function copyGuardMinWords(captionTone?: HyperframesCaptionTone, hasNarration = false): number {
  if (hasNarration) return 5;
  if (captionTone === "hype") return 3;
  if (captionTone === "social") return 4;
  return 5;
}

function findBaselineCopyGuardIssues(
  text: string,
  opts: {
    label: string;
    captionTone?: HyperframesCaptionTone;
    hasNarration?: boolean;
  }
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [`${opts.label}: empty copy`];

  const issues: string[] = [];
  const banned = findBannedPhrases(normalized);
  if (banned.length > 0) {
    issues.push(`${opts.label}: banned phrases (${banned.join(", ")})`);
  }
  if (isThinText(normalized, copyGuardMinWords(opts.captionTone, opts.hasNarration === true))) {
    issues.push(`${opts.label}: thin copy`);
  }
  return issues;
}

function findReelSceneCopyGuardIssues(
  scene: { caption: string; kicker?: string; narration?: string },
  index: number,
  captionTone?: HyperframesCaptionTone
): string[] {
  const blob = [scene.caption, scene.kicker, scene.narration].filter(Boolean).join(" ");
  return findBaselineCopyGuardIssues(blob, {
    label: `Scene ${index + 1}`,
    captionTone,
    hasNarration: Boolean(scene.narration?.trim()),
  });
}

function findHtmlSlideCopyGuardIssues(
  slides: string[],
  captionTone?: HyperframesCaptionTone
): string[] {
  return slides.flatMap((html, i) =>
    findBaselineCopyGuardIssues(htmlSlideVisibleText(html), {
      label: `Slide ${i + 1}`,
      captionTone,
    })
  );
}

async function repairHtmlSlidesCopyGuard(
  rawDeck: string,
  userBrief: string,
  canvasW: number,
  canvasH: number,
  captionTone?: HyperframesCaptionTone
): Promise<string | null> {
  const prompt = `${HTML_SLIDES_CREATIVE_DIRECTIVES}

You fix HTML slide decks when the visible copy is thin or uses banned AI/marketing filler.

Rewrite ONLY visible copy (headlines, kickers, short labels, supporting lines). Keep every \`<img src="…">\` exactly the same, same ${canvasW}×${canvasH} wrapper, inline styles, and animation structure. Close all tags.

Problems to fix:
- Remove banned phrases: in today's fast-paced world, revolutionary, game-changing, unlock, elevate, here's the thing, let's dive in, buckle up, the future of, curated
- Replace thin copy with concrete, scene-specific language that sounds finished on screen
- Keep tone aligned to ${captionTone ?? "social"}

Return the FULL deck with ---SLIDE--- separators only. No markdown fences.

USER BRIEF:
${userBrief.slice(0, 800)}

INPUT:
${rawDeck.slice(0, 95_000)}`;

  try {
    const raw = await callOllamaChat([{ role: "user", content: prompt }], true);
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/```(?:html)?\s*/gi, "")
      .replace(/```\s*$/g, "")
      .trim();
    if (cleaned.includes("---SLIDE---") && cleaned.includes("<")) return cleaned;
  } catch {
    /* fall through */
  }
  return null;
}

async function repairHtmlSlidesTechBro(
  rawDeck: string,
  userBrief: string,
  canvasW: number,
  canvasH: number
): Promise<string | null> {
  const prompt = `${HTML_SLIDES_CREATIVE_DIRECTIVES}

You fix HTML slide decks. The draft used fake "DevOps / incident room" mono labels and startup jargon in visible text.

Rewrite ONLY visible copy (headlines, kickers, mono labels, supporting lines). Keep every \`<img src="…">\` exactly the same, same ${canvasW}×${canvasH} wrapper, inline styles, @keyframes, and Google Fonts links. Close all tags — no broken \`</div\`.

Banned in output: "// CORE DIRECTIVE", "STATUS:", "PROTOCOL:", "DEPLOYMENT", "ANTI-PERFORMANCE", "PERFORMANCE CHECK", severity/incident cosplay, deploy/ship/sprint metaphors, "don't miss the next deployment".

Use editorial kickers: scene index (01 / 06), mood, place, or a joke tied to the brief — not IT role-play.

Return the FULL deck with ---SLIDE--- separators only. No markdown fences.

USER BRIEF:
${userBrief.slice(0, 800)}

INPUT:
${rawDeck.slice(0, 95_000)}`;

  try {
    const raw = await callOllamaChat([{ role: "user", content: prompt }], true);
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/```(?:html)?\s*/gi, "")
      .replace(/```\s*$/g, "")
      .trim();
    if (cleaned.includes("---SLIDE---") && cleaned.includes("<")) return cleaned;
  } catch {
    /* fall through */
  }
  return null;
}

/** One repair pass when the model slips into LinkedIn voice or scrambles scene/src order. */
async function repairReelJsonForRoast(
  badJson: string,
  userBrief: string,
  lockedSrcOrder?: string[]
): Promise<string | null> {
  const orderBlock =
    lockedSrcOrder && lockedSrcOrder.length > 0
      ? `
LOCKED PHOTO ORDER — ${lockedSrcOrder.length} scenes only:
${lockedSrcOrder.map((s, i) => `  Scene ${i + 1}: "src" MUST be exactly "${s}"`).join("\n")}
Delete extra scenes or duplicate uses of the same photo. No scene may repeat an image.`
      : "";

  const prompt = `${GEMMA_JSON_CREATIVE_DIRECTIVES}

You are a ruthless copy editor for short-form ROAST comedy (TikTok/Reels), NOT startups.

Fix the JSON below. Problems may include: LinkedIn/tech voice, wrong number of scenes, wrong or duplicate "src" paths, or the same photo used twice.
Rewrite caption, kicker, and narration on EVERY scene. Jokes must describe what you would SEE (dolls, toy skin, suits, car interior, cigarette, wig, clown paint) — not work or Monday motivation.

STRICT:
- Output ONE valid JSON object only. No markdown fences.
- Preserve "title" / "brandName" if present unless they scream corporate podcast — then rename to a short roast title (PascalCase).
${orderBlock || "- Keep the same number of scenes; each src path must match the input (unless you are fixing duplicates)."}
- No wording: ship, deploy, deployment, logout, sprint, refactor, firmware, deprecated, buffering, metrics, v1.0, fail fast, year stack, "don't miss the next", iterate, throughput, stack, PMF, product-market, simulation, hard reboot, MVP, latency, stakeholder, retro, kickstart, encore, curtain call, own the week, product-market fit, get back to the stack.
- CTAs: say "follow for the rest" / "part 2" / "run it back" — never "next deployment" or SaaS metaphors.
- Sound like a friend roasting on FaceTime, not a manager.

User brief: ${userBrief.slice(0, 600)}

INPUT JSON:
${badJson.slice(0, 14_000)}`;
  try {
    const raw = await callOllamaChat([{ role: "user", content: prompt }], true);
    const p = safeJson(raw);
    if (p && typeof p === "object" && Array.isArray((p as Record<string, unknown>).scenes)) {
      return JSON.stringify(p);
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function repairReelJsonForCopyGuard(
  badJson: string,
  userBrief: string,
  captionTone: HyperframesCaptionTone,
  lockedSrcOrder?: string[]
): Promise<string | null> {
  const orderBlock =
    lockedSrcOrder && lockedSrcOrder.length > 0
      ? `
LOCKED PHOTO ORDER — ${lockedSrcOrder.length} scenes only:
${lockedSrcOrder.map((s, i) => `  Scene ${i + 1}: "src" MUST be exactly "${s}"`).join("\n")}
Delete extra scenes or duplicate uses of the same photo.`
      : "";

  const prompt = `${GEMMA_JSON_CREATIVE_DIRECTIVES}

You are fixing a reel JSON scene plan. The draft has baseline copy-quality issues.

Rewrite caption, kicker, and narration so each scene feels concrete, specific, and social-native.

STRICT:
- Output ONE valid JSON object only. No markdown fences.
- Keep "title" / "brandName" unless clearly broken.
${orderBlock || "- Keep src values valid and scene count stable."}
- Remove banned phrases: in today's fast-paced world, revolutionary, game-changing, unlock, elevate, here's the thing, let's dive in, buckle up, the future of, curated
- Avoid thin copy. Each scene needs enough substance to work on screen and in TTS.
- Tone: ${captionTone}

User brief: ${userBrief.slice(0, 600)}

INPUT JSON:
${badJson.slice(0, 14_000)}`;
  try {
    const raw = await callOllamaChat([{ role: "user", content: prompt }], true);
    const p = safeJson(raw);
    if (p && typeof p === "object" && Array.isArray((p as Record<string, unknown>).scenes)) {
      return JSON.stringify(p);
    }
  } catch {
    /* fall through */
  }
  return null;
}

function validateReelSpec(
  raw: unknown,
  validPaths: Set<string>,
  limits?: { captionMax: number; kickerMax: number },
  maxSceneCount = 16,
  opts?: {
    roastCopyCheck?: boolean;
    copyGuardTone?: HyperframesCaptionTone;
    /** When set: scenes.length must match, scene i src must equal paths[i], no duplicate src */
    enforceImageOrder?: string[];
  }
): { ok: true; spec: ReelSpec } | { ok: false; error: string } {
  const captionMax = limits?.captionMax ?? 36;
  const kickerMax = limits?.kickerMax ?? 56;
  if (!raw || typeof raw !== "object") return { ok: false, error: "response is not an object" };
  const obj = raw as Record<string, unknown>;
  const scenes = obj.scenes;
  if (!Array.isArray(scenes)) return { ok: false, error: "scenes must be an array" };
  if (scenes.length < 1) return { ok: false, error: "scenes must not be empty" };
  if (scenes.length > maxSceneCount) return { ok: false, error: `scenes has more than ${maxSceneCount} entries` };

  const cleaned: ReelScene[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s || typeof s !== "object") return { ok: false, error: `scene ${i} is not an object` };
    const sc = s as Record<string, unknown>;
    const src = typeof sc.src === "string" ? sc.src.trim() : "";
    if (!src) return { ok: false, error: `scene ${i}: src is required` };
    if (!validPaths.has(src)) return { ok: false, error: `scene ${i}: src "${src}" is not one of the uploaded images` };

    const caption = typeof sc.caption === "string" ? sc.caption.trim() : "";
    if (!caption) return { ok: false, error: `scene ${i}: caption is required` };

    const kicker =
      typeof sc.kicker === "string" && sc.kicker.trim() ? sc.kicker.trim().slice(0, kickerMax) : undefined;

    const narration = typeof sc.narration === "string" && sc.narration.trim() ? sc.narration.trim().slice(0, 200) : undefined;

    let accent: string | undefined;
    if (typeof sc.accent === "string") {
      const a = sc.accent.trim();
      if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(a)) accent = a;
    }

    let transition: Transition | undefined;
    if (typeof sc.transition === "string") {
      const t = sc.transition.trim().toLowerCase() as Transition;
      if (VALID_TRANSITIONS.includes(t)) transition = t;
    }

    cleaned.push({
      src,
      caption: caption.slice(0, captionMax),
      kicker,
      accent,
      transition,
      narration,
    });
  }

  if (opts?.enforceImageOrder?.length) {
    const order = opts.enforceImageOrder;
    if (cleaned.length !== order.length) {
      return {
        ok: false,
        error: `This reel must have exactly ${order.length} scenes (one per uploaded photo). Got ${cleaned.length}.`,
      };
    }
    for (let i = 0; i < order.length; i++) {
      if (cleaned[i].src !== order[i]) {
        return {
          ok: false,
          error: `Scene ${i + 1} must use the ${i + 1}th uploaded image path "${order[i]}" (not "${cleaned[i].src}"). Same order as the attachment strip.`,
        };
      }
    }
    const srcs = cleaned.map((c) => c.src);
    if (new Set(srcs).size !== srcs.length) {
      return {
        ok: false,
        error: "Each uploaded image may appear only once — remove duplicate src entries.",
      };
    }
  }

  if (opts?.roastCopyCheck) {
    for (let i = 0; i < cleaned.length; i++) {
      const blob = [cleaned[i].caption, cleaned[i].kicker, cleaned[i].narration].filter(Boolean).join(" ");
      const bad = findRoastJargonInText(blob);
      if (bad.length) {
        return {
          ok: false,
          error: `Scene ${i + 1} sounds like startup/motivation jargon (${bad.slice(0, 4).join(", ")}) — rewrite as a visual roast.`,
        };
      }
    }
  }

  if (opts?.copyGuardTone) {
    for (let i = 0; i < cleaned.length; i++) {
      const issues = findReelSceneCopyGuardIssues(cleaned[i], i, opts.copyGuardTone);
      if (issues.length > 0) {
        return { ok: false, error: issues[0] };
      }
    }
  }

  const title = typeof obj.title === "string" ? obj.title.trim().slice(0, 24) : undefined;
  const brandName =
    typeof obj.brandName === "string" && obj.brandName.trim()
      ? obj.brandName.trim().slice(0, 32)
      : undefined;

  return { ok: true, spec: { title, brandName, scenes: cleaned } };
}

// Turn the validated spec into a tiny TSX file that passes scenes to
// <CinematicReel>. No motion code — just a data wrapper.
function renderReelComponent(
  componentName: string,
  spec: ReelSpec,
  sceneLen: number,
  transLen: number,
  opts: { captionFont: string; kickerFont: string; decor: ReelDecorId; sceneTTSPaths?: string[]; gradePreset?: string }
): string {
  const json = JSON.stringify(spec.scenes, null, 2);
  const indentedJson = json
    .split("\n")
    .map((line, i) => (i === 0 ? line : `      ${line}`))
    .join("\n");
  const brand = JSON.stringify(spec.brandName ?? "VISIO●REEL");
  const cap = JSON.stringify(opts.captionFont);
  const kick = JSON.stringify(opts.kickerFont);
  const decor = JSON.stringify(opts.decor);
  const grade = JSON.stringify(opts.gradePreset ?? "neutral_punch");
  const ttsPathsJson = opts.sceneTTSPaths?.some((p) => p)
    ? JSON.stringify(opts.sceneTTSPaths)
    : null;

  return `import React from "react";
import { CinematicReel } from "../components/CinematicReel";

// Auto-generated by /api/agent. Do not edit by hand — re-run the agent instead.
export const ${componentName}: React.FC = () => {
  return (
    <CinematicReel
      brandName={${brand}}
      captionFontFamily={${cap}}
      kickerFontFamily={${kick}}
      decorStyle={${decor}}
      gradePreset={${grade}}
      sceneLengthInFrames={${sceneLen}}
      transitionLengthInFrames={${transLen}}
      scenes={${indentedJson}}
${ttsPathsJson ? `      sceneTTSPaths={${ttsPathsJson}}\n` : ""}    />
  );
};
`;
}

function slugifyTitle(title: string | undefined, fallbackHash: string): string {
  const base = (title ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (base && /^[A-Z]/.test(base)) return base.slice(0, 24);
  if (base) return "Reel" + base[0].toUpperCase() + base.slice(1, 23);
  return `Reel_${fallbackHash}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FREEFORM TSX MODE — unchanged legacy path for prompts without attachments
// ═══════════════════════════════════════════════════════════════════════════════

function buildDirectorBriefBlock(brief: DirectorBrief | null | undefined): string {
  if (!brief) return "";
  const sceneSummary = brief.scenes.map((s, i) =>
    `  Scene ${i + 1} [${s.layout}]: headline="${s.headline}" · kicker="${s.kicker}" · accent=${s.accent} · primitives=[${s.primitives.join(",")}] · transition=${s.transition} · motion: "${s.motion_note}"${s.data_points?.length ? ` · data=[${s.data_points.map(d => `${d.label}:${d.value}${d.unit ?? ""}`).join(", ")}]` : ""}`
  ).join("\n");
  return `
═══ DIRECTOR BRIEF (your specification — execute it, do not invent alternatives) ═══
Title: ${brief.title}
Logline: ${brief.logline}
Hook: ${brief.hook}
Palette: bg=${brief.palette.bg} · text=${brief.palette.text} · accent=${brief.palette.accent} · secondary=${brief.palette.secondary}
Typography: headline="${brief.typography.headline_font}" · mono="${brief.typography.mono_font}" · note="${brief.typography.style_note}"
Motion language: ${brief.motion_language}
Energy: ${brief.overall_energy}

SCENE BREAKDOWN (implement each scene in order using a <Sequence> or TransitionSeries segment):
${sceneSummary}

EXECUTION RULES:
- Use the EXACT headlines and kickers from the brief above — do not paraphrase or invent new copy
- Use the exact accent colors per scene (swap between scenes for visual variety)
- Import and use the specified primitives from "../components/primitives"
- Apply the motion_note for each scene's animation timing
- If data_points are specified, render them with <DataReadout> or <TelemetryCounter>
`;
}

function buildPrompt(
  userRequest: string,
  filePath: string | null,
  fileContent: string | null,
  durationInFrames: number,
  creative: HyperframesCreativeProfile,
  canvasW: number,
  canvasH: number,
  brief?: DirectorBrief | null
): string {
  const imagesImportNeeded = needsImages(userRequest);

  const hfBlock = buildHyperframesCreativeBlock(creative);
  const codeVisualBlock = buildCodeVisualPowerBlock(creative, canvasW, canvasH, userRequest);

  const motionSpringHints: Record<HyperframesMotionFeel, string> = {
    smooth: "Prefer spring({ config: { damping: 22, stiffness: 90 } }) for smooth deceleration.",
    snappy: "Prefer spring({ config: { damping: 16, stiffness: 200 } }) for snappy motion.",
    bouncy: "Prefer spring({ config: { damping: 10, stiffness: 180 } }) with slight overshoot for bouncy feel.",
    dramatic: "Use interpolate with Easing.bezier or Easing.out(Easing.cubic) for long dramatic ramps.",
    dreamy: "Use interpolate with Easing.inOut(Easing.sine) for dreamy symmetrical motion.",
  };

  const determinism = `DETERMINISM — same render every frame:
- NEVER use Math.random(). Use random('stable-seed-string') from "remotion" — returns 0..1, deterministic.
- Every animated element needs predictable frame-based math (interpolate/spring).`;

  const rules = `REMOTION RULES (official — follow exactly):
- Hooks (useCurrentFrame, useVideoConfig) ONLY inside functional components, never at module level
- Animations: spring() or interpolate() only — NO framer-motion, NO CSS transitions
- Randomness: import { random } from "remotion" — use random('my-seed') not Math.random()
- Graphics: inline <svg> (paths, lines, gradients) and stacked <AbsoluteFill> layers — animate SVG props from frame
- Core imports: import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing, AbsoluteFill, Sequence, Series, random${imagesImportNeeded ? ", Img, staticFile" : ""} } from "remotion"
- Transitions: import { TransitionSeries, springTiming, linearTiming } from "@remotion/transitions"; import { fade } from "@remotion/transitions/fade"; import { wipe } from "@remotion/transitions/wipe"; import { slide } from "@remotion/transitions/slide"
- Sequential scenes without explicit "from": use <Series><Series.Sequence durationInFrames={N}>…</Series.Sequence></Series>
- With transitions between scenes: use <TransitionSeries> — order is Sequence → Transition → Sequence
- Word/element stagger: spring({ frame: Math.max(0, frame - i * stagger), fps, config: {damping, stiffness} })
- ${motionSpringHints[creative.motionFeel]}
- Root: <AbsoluteFill> wrapper required
- Named export: export const ComponentName: React.FC = () => { ... }${imagesImportNeeded ? `\n- IMAGES (only if brief asks for photos): <Img src="https://images.unsplash.com/photo-ID?w=${canvasW}&h=${canvasH}&fit=crop&q=80" style={{width:"100%",height:"100%",objectFit:"cover"}} />` : ""}
- ${determinism}`;

  const layoutSafety = `TEXT PLACEMENT & CONTRAST RULES (mandatory — never violate these):
- Text ALWAYS at bottom of frame: use position:"absolute", bottom:0, left:0, right:0 with padding ~8–14% of height
- NEVER place text at top-left or centered-top — bottom-anchored only so it clears faces/subjects
- Always add a dark gradient scrim behind text: background:"linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.38) 50%, transparent 80%)"
- Text color MUST contrast with background — never use white on near-white images, never use black on dark images
- For photo backgrounds: always use white text (#fff or #f8f8f8) with the gradient scrim above
- Accent/highlight colors: choose from bold saturated hues (#ff3d3d #ff8a00 #ffd43b #54d38f #4cc9ff #a78bfa) — avoid light pastels on dark backgrounds
- Letter-spacing for headlines: min 0.08em, prefer 0.12–0.2em for cinematic feel
- Kicker/subtitle: place just above headline, smaller font, monospaced, accent color`;

  const strictFormat = `OUTPUT CONTRACT — critical:
- Respond with ONE \`\`\`tsx fenced code block and nothing else
- NO JSON, NO prose, NO "Here is…", NO reel specs, NO markdown headings
- The code block must be a complete, compilable .tsx React component`;

  // Cultural context for HyperFrames HTML slides
  const hfPlatformMap: Record<string, Platform> = {
    hype: "instagram", social: "tiktok", corporate: "linkedin",
    tutorial: "x", storytelling: "instagram",
  };
  const hfPlatform: Platform = hfPlatformMap[creative.captionTone ?? "social"] ?? "instagram";
  const hfCulturalBlock = buildCulturalContext({
    brief: userRequest,
    platform: hfPlatform,
    captionTone: (creative.captionTone ?? "social") as Parameters<typeof buildCulturalContext>[0]["captionTone"],
    contentTypes: [],
    copyStyles: [],
  });

  const fps = 30;
  const secs = Math.round(durationInFrames / fps);
  const orient = canvasW >= canvasH ? "landscape or square" : "portrait";
  const runtimeCopyBlock = `RUNTIME & SCRIPT — ${secs}s total (${durationInFrames} frames @ ${fps}fps):
- The composition MUST fill ~${durationInFrames} frames: sum of every <Sequence durationInFrames={…}> (plus any TransitionSeries gaps) should cover the full timeline — not a 5s clip stretched or a short loop.
- ${secs >= 45 ? `Long-form (${secs}s): multiple distinct beats — hook, story/proof, payoff, CTA. On-screen text should use platform-native social lingo where appropriate (Reels/TikTok/Shorts: hooks like "POV", "here's the truth", "save this"; LinkedIn: crisp headlines — match CREATIVE caption tone).` : `Pack 2+ sequences with clear visual/text evolution.`}
- Vary typography scale and motion so long videos don't feel like one static card.
- Show Remotion's strength: vector lines, faux charts, grids, and layered motion — not a single text box on a flat colour unless the brief is explicitly minimal.`;

  const directorBlock = buildDirectorBriefBlock(brief);
  const primitivesImportLine = brief?.scenes.some(s => s.primitives.length > 0)
    ? `- Primitives import: import { ${[...new Set(brief.scenes.flatMap(s => s.primitives))].join(", ")} } from "../components/primitives";`
    : `- Primitives available: import { HUDCorners, StarField, GridOverlay, KineticTitle, TelemetryCounter, StatusBar, DataReadout, ScanLines, LightLeak } from "../components/primitives";`;

  if (filePath && fileContent) {
    const lines = fileContent.split("\n");
    const trimmed = lines.length > 120 ? lines.slice(0, 120).join("\n") + "\n// ... (truncated)" : fileContent;
    return `${FREEFORM_CODE_CREATIVE_DIRECTIVES}\n\n${hfBlock}\n\n${hfCulturalBlock}\n\n${codeVisualBlock}\n\n${rules}\n${primitivesImportLine}\n- ${determinism}\n\n${layoutSafety}\n\n${strictFormat}${directorBlock}\n\nCURRENT FILE (${filePath}):\n\`\`\`tsx\n${trimmed}\n\`\`\`\n\nTASK: ${userRequest}\n\n${runtimeCopyBlock}\n\nOutput the COMPLETE modified file in a single \`\`\`tsx block. No explanations.`;
  }

  return `${FREEFORM_CODE_CREATIVE_DIRECTIVES}\n\n${hfBlock}\n\n${hfCulturalBlock}\n\n${codeVisualBlock}\n\n${rules}\n${primitivesImportLine}\n\n${layoutSafety}\n\n${strictFormat}${directorBlock}\n\nTASK: ${userRequest}\n\nSPECS: ${secs}s = ${durationInFrames}fr @ ${fps}fps, canvas ${canvasW}×${canvasH} (${orient}) — match this composition size in all layout math.\n${runtimeCopyBlock}\nUse <Sequence> or <TransitionSeries> for multiple scenes with cinematic transitions aligned to the creative directive.\n\nOutput format (exactly this shape, nothing else):\n\`\`\`tsx\nimport { useCurrentFrame, ... } from "remotion";\nexport const YourComponentName: React.FC = () => { ... };\n\`\`\`\nFILE: remotion/compositions/YourComponentName.tsx`;
}

function hasModuleLevelHook(code: string): boolean {
  const sf = ts.createSourceFile("g.tsx", code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node: ts.Node, insideFn: boolean) => {
    if (found) return;
    const isFnScope =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node);
    const childInsideFn = insideFn || isFnScope;
    if (
      !insideFn &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "useCurrentFrame" ||
        node.expression.text === "useVideoConfig")
    ) {
      found = true;
      return;
    }
    node.forEachChild((c) => visit(c, childInsideFn));
  };
  sf.forEachChild((c) => visit(c, false));
  return found;
}

function quickValidate(filePath: string): { ok: boolean; error: string } {
  try {
    const source = fs.readFileSync(filePath, "utf-8");
    const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    const diags = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
    if (diags.length) {
      const msg = diags
        .slice(0, 5)
        .map((d) => {
          const { line } = ts.getLineAndCharacterOfPosition(sf, d.start ?? 0);
          return `L${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
        })
        .join("\n");
      return { ok: false, error: msg.slice(0, 400) };
    }
    return { ok: true, error: "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 300) };
  }
}

function extractCode(response: string): string | null {
  const fenced = response.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*\n([\s\S]*?)```/);
  if (fenced && looksLikeReactCode(fenced[1])) return fenced[1].trim();
  const opened = response.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*\n([\s\S]+)$/);
  if (opened && looksLikeReactCode(opened[1])) return opened[1].replace(/```[\s\S]*$/, "").trim();
  if (looksLikeReactCode(response)) {
    const idx = response.search(/^\s*(import|export)\s/m);
    return idx >= 0 ? response.slice(idx).trim() : response.trim();
  }
  return null;
}

function looksLikeReactCode(s: string): boolean {
  return /\b(import\s+[\s\S]+?from\s+['"]remotion['"]|export\s+const\s+\w+\s*:\s*React\.FC|<AbsoluteFill|useCurrentFrame\(\))/.test(s);
}

function autofixCode(code: string): string {
  let out = code;
  out = out.replace(
    /fontSize:\s*['"](\d+(?:\.\d+)?)rem['"]/g,
    (_m, n) => `fontSize: ${Math.round(parseFloat(n) * 16)}`
  );
  out = out.replace(/(<Sequence\b[^>]*?)\bduration=\{/g, "$1durationInFrames={");
  return out;
}

function normalizeExportName(code: string, expectedName: string): string {
  let out = code;
  const defaultMatch = out.match(/\n?export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m);
  if (defaultMatch) {
    const oldName = defaultMatch[1];
    out = out.replace(defaultMatch[0], "");
    const re = new RegExp(`(^|\\n)(?:export\\s+)?const\\s+${oldName}\\b`);
    if (re.test(out)) {
      out = out.replace(re, `$1export const ${expectedName}`);
      if (oldName !== expectedName) {
        out = out.replace(new RegExp(`\\b${oldName}\\b`, "g"), expectedName);
      }
    } else {
      out = `${out.trim()}\nexport const ${expectedName} = ${oldName};\n`;
    }
  }

  const namedMatch = out.match(/export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*React\.FC/);
  if (namedMatch && namedMatch[1] !== expectedName) {
    const oldName = namedMatch[1];
    out = out.replace(new RegExp(`\\b${oldName}\\b`, "g"), expectedName);
  }

  if (!/export\s+const\s+[A-Za-z_$][\w$]*\s*:\s*React\.FC/.test(out)) {
    out = out.replace(
      /export\s+default\s+(?:function\s*)?(?:\(\s*\)\s*=>|function\s*\(\s*\)\s*)/,
      `export const ${expectedName}: React.FC = () => `
    );
  }

  return out;
}

// ── Shared: register new composition in Root.tsx ─────────────────────────────

function registerInRoot(
  componentName: string,
  outPath: string,
  durationInFrames: number,
  width = 1080,
  height = 1920
): void {
  const rootPath = projectPath("remotion/Root.tsx");
  const root = fs.readFileSync(rootPath, "utf-8");
  if (root.includes(`id="${componentName}"`)) return; // already registered
  const compRelative = outPath
    .replace(/^remotion\//, "./")
    .replace(/\.tsx$/, "");
  const updated = root
    .replace(
      /import \{ Reel, DEFAULT_SCENES \} from/,
      `import { ${componentName} } from "${compRelative}";\nimport { Reel, DEFAULT_SCENES } from`
    )
    .replace(
      /    <\/>\n  \);\n\};/,
      `      <Composition id="${componentName}" component={${componentName}} durationInFrames={${durationInFrames}} fps={30} width={${width}} height={${height}} defaultProps={{}} />\n    </>\n  );\n};`
    );
  fs.writeFileSync(rootPath, updated, "utf-8");
}

/**
 * Resolve a Voicebox profile for TTS narration.
 * - If ttsVoice looks like a preset voice_id (e.g. "af_bella", "bm_george"), use ensurePresetProfile.
 * - Otherwise fall back to the legacy resolveProfileForNarration (matches by name/id).
 */
async function resolveVoiceProfile(ttsVoice: string) {
  const PRESET_PATTERN = /^[a-z]{2}_[a-z]+$/i;
  if (PRESET_PATTERN.test(ttsVoice.trim())) {
    return ensurePresetProfile(ttsVoice.trim().toLowerCase(), "kokoro");
  }
  return resolveProfileForNarration(ttsVoice);
}

async function generateSceneTTS(
  scenes: Array<{ caption: string; kicker?: string; narration?: string }>,
  componentName: string,
  profileId: string,
  onProgress: (msg: string) => void,
  engine?: string,
  captionTone?: string,
  motionFeel?: string,
  roastDelivery?: boolean,
): Promise<string[]> {
  const publicDir = projectPath("public", "tts");
  fs.mkdirSync(publicDir, { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const text = buildNarrationText({
      caption: scene.caption,
      kicker: scene.kicker,
      narration: scene.narration,
      captionTone: (captionTone ?? "social") as CaptionTone,
      sceneIndex: i,
      totalScenes: scenes.length,
    });
    if (!text) { paths.push(""); continue; }

    const direction = buildVoiceDirection({
      captionTone: (captionTone ?? "social") as CaptionTone,
      motionFeel: (motionFeel ?? "smooth") as MotionFeel,
      contentSeed: `${componentName}:${i}:${text}`,
      roastDelivery: roastDelivery === true,
    });

    const filename = `${componentName}-scene-${i}.wav`;
    const outputPath = path.join(publicDir, filename);
    onProgress(`TTS scene ${i + 1}/${scenes.length}…`);

    const ok = await generateSpeech({ text, profileId, outputPath, engine, ...direction });
    paths.push(ok ? `tts/${filename}` : "");
  }
  return paths;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route
// ═══════════════════════════════════════════════════════════════════════════════

/** Long-running Ollama + optional Playwright render — allow generous wall time on Vercel. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: {
    userMessage?: unknown;
    attachments?: unknown;
    /** "hyperframes" = Gemma HTML → Playwright PNG → HtmlSlideVideo; "remotion" = CinematicReel. */
    pipeline?: unknown;
    aspect?: unknown;
    pace?: unknown;
    maxScenes?: unknown;
    useVision?: unknown;
    useTTS?: unknown;
    ttsVoice?: unknown;
    motionFeel?: unknown;
    captionTone?: unknown;
    transitionEnergy?: unknown;
    durationSeconds?: unknown;
    reelTypography?: unknown;
    reelDecor?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response(
      JSON.stringify({
        error:
          "Request body must be valid JSON with { userMessage, attachments?, aspect?, pace?, maxScenes?, useVision?, motionFeel?, captionTone?, transitionEnergy?, durationSeconds?, reelTypography?, reelDecor? }.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
  const attachments = rawAttachments
    .filter((a): a is { path: string; name: string } => {
      if (!a || typeof a !== "object") return false;
      const o = a as Record<string, unknown>;
      return typeof o.path === "string" && typeof o.name === "string";
    })
    .filter((a) => /^uploads\/[A-Za-z0-9._-]+$/.test(a.path));
  const hasAttachments = attachments.length > 0;
  const userMessage =
    typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  const pipeline =
    body.pipeline === "hyperframes" ? "hyperframes" : "remotion";
  if (!userMessage && !hasAttachments) {
    return new Response(
      JSON.stringify({
        error:
          "Provide a written brief (userMessage) or attach at least one image. Images-only reels use vision descriptions when the prompt is blank.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const reelTypography: ReelTypographyId = parseReelTypographyId(body.reelTypography);
  const reelDecor: ReelDecorId = parseReelDecorId(body.reelDecor);

  // Auto-pick grade preset from motion feel — cinematic/dramatic gets warm grade,
  // snappy/hype gets neutral punch, dreamy gets matte film, corporate/calm gets subtle.
  const gradePresetMap: Record<string, string> = {
    smooth: "neutral_punch",
    snappy: "neutral_punch",
    bouncy: "warm_cinematic",
    dramatic: "warm_cinematic",
    dreamy: "matte_film",
  };
  const creative0 = parseCreativeProfile(body);
  const autoGradePreset = gradePresetMap[creative0.motionFeel] ?? "neutral_punch";
  const aspect: Aspect =
    body.aspect === "1:1" || body.aspect === "4:5" || body.aspect === "16:9" || body.aspect === "9:16"
      ? body.aspect
      : "9:16";
  const pace: Pace =
    body.pace === "chill" || body.pace === "balanced" || body.pace === "fast" || body.pace === "hype"
      ? body.pace
      : "balanced";
  const maxScenes =
    typeof body.maxScenes === "number" && Number.isFinite(body.maxScenes)
      ? Math.max(2, Math.min(24, Math.round(body.maxScenes)))
      : 6;
  /** Never generate fewer scenes than uploaded images (fixes "8 photos → 6 scenes" when UI default is 6). */
  const effectiveMaxScenes = hasAttachments
    ? Math.min(24, Math.max(maxScenes, attachments.length))
    : maxScenes;
  const useVision = body.useVision !== false; // default on
  const useTTS = body.useTTS === true;
  const ttsVoice = typeof body.ttsVoice === "string" ? body.ttsVoice : "default";
  const creative = parseCreativeProfile(body);
  const targetDurationSec =
    typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.max(5, Math.min(600, Math.round(body.durationSeconds)))
      : 30;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      let streamFinished = false;
      const finishStream = () => {
        if (streamFinished) return;
        streamFinished = true;
        try {
          ctrl.close();
        } catch {
          /* already closed or errored */
        }
      };

      const send = (ev: Record<string, unknown>): boolean => {
        if (streamFinished) return false;
        try {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
          return true;
        } catch {
          streamFinished = true;
          return false;
        }
      };

      try {
      // ── HTML slide video (Gemma → ---SLIDE--- HTML → Playwright PNG → HtmlSlideVideo) ──
      if (pipeline === "hyperframes") {
        const { w, h, label } = ASPECTS[aspect];
        const slideCap = Math.min(
          10,
          Math.max(
            effectiveMaxScenes,
            hasAttachments ? attachments.length : 0
          )
        );
        // Use the same target-duration math as the Remotion pipeline so the
        // selected duration (10s, 30s, etc.) is actually respected.
        const { sceneLen, transLen } = computeSceneTimingForTarget(targetDurationSec, slideCap, pace);

        let visionNotes: VisionNote[] = [];
        const attachmentsForPrompt = attachments;

        if (hasAttachments) {
          send({
            type: "status",
            text: `HTML slides · ${label} · scanning ${attachments.length} image(s)…`,
          });
          const analysisResults = await Promise.all(
            attachments.map((a) => analyzeImage(a.path, a.name))
          );
          if (!analysisResults.some(Boolean)) {
            send({ type: "error", content: "Couldn't read any of the uploaded images from disk." });
            return;
          }
          const analyses = analysesForAttachments(attachments, analysisResults);
          visionNotes = analyses.map((a) => ({
            path: a.path,
            subject: "",
            mood: "",
            palette: [a.dominant],
            brightness: a.brightness,
          }));
          if (useVision) {
            send({
              type: "status",
              text: `Vision pass · ${analyses.length} image(s) in ${Math.ceil(analyses.length / VISION_CHUNK_SIZE)} batch(es)…`,
            });
            const batchNotes = await describeImagesBatch(analyses, creative.captionTone);
            visionNotes = visionNotes.map((base, i) => batchNotes[i] ?? base);
            visionNotes.forEach((note) => send({ type: "vision_note", note }));
          } else {
            analyses.forEach((a, i) => {
              send({
                type: "vision_note",
                note: {
                  path: a.path,
                  subject: `Photo ${i + 1} (${a.name}) — Vision is off; enable it for AI reads of each slide photo.`,
                  mood: "",
                  palette: [a.dominant],
                  brightness: a.brightness,
                },
              });
            });
          }
        }

        send({ type: "status", text: `Brain pass · creative director planning your video…` });
        const { concept: hfConcept, brief: hfBrief } = await runBrainPass(
          userMessage,
          visionNotes,
          hasAttachments ? attachments : null,
          aspect,
          creative,
          targetDurationSec,
          slideCap
        );
        if (hfConcept.title) send({ type: "brain_concept", concept: hfConcept });
        if (hfBrief) send({ type: "director_brief", brief: hfBrief });

        send({
          type: "status",
          text: `HTML slide video · ${label} · up to ${slideCap} slides · ${pace} pace${hasAttachments ? ` · ${attachments.length} photo(s)` : ""}`,
        });
        const prompt = buildHtmlSlidesPrompt(
          userMessage,
          w,
          h,
          slideCap,
          creative,
          targetDurationSec,
          attachmentsForPrompt,
          visionNotes,
          hfBrief
        );
        const numPredict = htmlSlideNumPredict(slideCap, hasAttachments);
        const hfTimeoutMs = htmlSlideStreamTimeoutMs(slideCap, numPredict);
        send({
          type: "status",
          text: `Gemma · HTML stream · budget ${Math.round(hfTimeoutMs / 1000)}s · ${slideCap} slide cap · num_predict ${numPredict}`,
        });
        let response = "";
        try {
          response = await streamOllama(
            prompt,
            (tok) => send({ type: "token", tok }),
            {
              temperature: 0.35,
              num_predict: numPredict,
              timeoutMs: hfTimeoutMs,
            }
          );
        } catch (e) {
          send({ type: "error", content: `Ollama error: ${e}` });
          return;
        }
        let slides = parseHtmlSlidesFromGemma(response);
        const bannedHits = slides.flatMap((html, i) =>
          findHyperframesBannedCopy(html).map((label) => `slide ${i + 1}: ${label}`)
        );
        if (bannedHits.length > 0) {
          send({
            type: "status",
            text: `Copy repair · stripping ${bannedHits.length} devops/jargon hit(s) from slides…`,
          });
          const fixed = await repairHtmlSlidesTechBro(response, userMessage, w, h);
          if (fixed) {
            const repairedSlides = parseHtmlSlidesFromGemma(fixed);
            if (repairedSlides.length > 0) {
              response = fixed;
              slides = repairedSlides;
            }
          }
        }
        let baselineCopyIssues = findHtmlSlideCopyGuardIssues(slides, creative.captionTone);
        if (baselineCopyIssues.length > 0) {
          send({
            type: "status",
            text: `Copy repair · fixing ${baselineCopyIssues.length} baseline copy issue(s) before render…`,
          });
          const fixed = await repairHtmlSlidesCopyGuard(response, userMessage, w, h, creative.captionTone);
          if (fixed) {
            const repairedSlides = parseHtmlSlidesFromGemma(fixed);
            if (repairedSlides.length > 0) {
              response = fixed;
              slides = repairedSlides;
              baselineCopyIssues = findHtmlSlideCopyGuardIssues(slides, creative.captionTone);
            }
          }
        }
        const stillBanned = slides.flatMap((html, i) =>
          findHyperframesBannedCopy(html).map((label) => `slide ${i + 1}: ${label}`)
        );
        if (stillBanned.length > 0) {
          send({
            type: "error",
            content: `Slides contain banned tech / fake-HUD copy: ${stillBanned.slice(0, 14).join("; ")}. Try a shorter deck or regenerate.`,
          });
          return;
        }
        if (baselineCopyIssues.length > 0) {
          send({
            type: "error",
            content: `Slides failed baseline copy guard: ${baselineCopyIssues.slice(0, 14).join("; ")}. Try regenerating with a more specific brief.`,
          });
          return;
        }
        if (!slides.length) {
          send({
            type: "error",
            content:
              "Couldn't read any slides from Gemma. It should output HTML separated by lines containing only ---SLIDE--- (or legacy JSON {\"slides\":[...]}). Try fewer slides / shorter copy, or run again.",
          });
          return;
        }
        send({
          type: "status",
          text: `Rendering ${slides.length} slide(s) to PNG (Chromium)…`,
        });
        const publicDir = projectPath("public");
        let renderResult: { jobId: string; paths: string[] };
        try {
          renderResult = await renderHtmlSlidesToPng({
            slides,
            width: w,
            height: h,
            publicDir,
          });
        } catch (e) {
          send({
            type: "error",
            content: e instanceof Error ? e.message : String(e),
          });
          return;
        }
        // TTS narration for HYPERFRAMES — brief lines per slide, HTML fallback if brief is short
        let hfNarrationPaths: string[] = [];
        const hfRoast = detectCreativeIntent(userMessage).isRoast;
        if (useTTS && slides.length > 0) {
          send({ type: "tts_note", text: "Voicebox · checking connection…" });
          const hfProfile = await resolveVoiceProfile(ttsVoice);
          if (hfProfile) {
            if (hfProfile.name.includes("Auto narration")) {
              send({
                type: "tts_note",
                text: "Voicebox · no saved voices — using preset narrator (slide text from brief or HTML)…",
              });
            }
            send({ type: "tts_note", text: `Voicebox · narrating slides with "${hfProfile.name}"…` });
            const ttsScenes = slides.map((html, i) => {
              const s = hfBrief?.scenes[i];
              if (s?.headline?.trim()) {
                return { caption: s.headline, kicker: s.kicker };
              }
              return {
                caption: extractNarrationFallbackFromSlideHtml(html),
                kicker: "",
              };
            });
            hfNarrationPaths = await generateSceneTTS(
              ttsScenes,
              `HtmlSlides-${renderResult.jobId}`,
              hfProfile.id,
              (msg) => send({ type: "tts_note", text: msg }),
              hfProfile.engine,
              creative.captionTone,
              creative.motionFeel,
              hfRoast,
            );
            const narrated = hfNarrationPaths.filter(Boolean).length;
            send({
              type: "tts_note",
              text:
                narrated > 0
                  ? `Voicebox · ${narrated} slide(s) narrated ✓`
                  : "Voicebox · no audio generated",
            });
          } else {
            send({
              type: "tts_note",
              text:
                "Voicebox unreachable or preset narrator failed — add a voice in Voicebox or set VOICEBOX_PRESET_ENGINE + VOICEBOX_PRESET_VOICE_ID",
            });
          }
        }

        const inputProps = {
          slidePaths: renderResult.paths,
          width: w,
          height: h,
          sceneLengthInFrames: sceneLen,
          transitionLengthInFrames: transLen,
          ...(hfNarrationPaths.some(Boolean) ? { narrationPaths: hfNarrationPaths } : {}),
        };
        const durationInFrames = computeHtmlSlideVideoDuration(
          slides.length,
          sceneLen,
          transLen
        );
        send({
          type: "html_slide_video",
          componentName: "HtmlSlideVideo",
          durationInFrames,
          width: w,
          height: h,
          inputProps,
          jobId: renderResult.jobId,
        });
        send({ type: "validation", success: true, output: "" });
        send({ type: "done" });
        return;
      }

      // ── Structured reel mode (attachments present) ───────────────────────
      if (hasAttachments) {
        const { w, h, label } = ASPECTS[aspect];
        send({
          type: "status",
          text: `Planning ${label} · ${targetDurationSec}s · ${pace} pace · ${creative.captionTone} copy · ${attachments.length} images`,
        });

        // Stage 0 — analyze each image in parallel (sharp stats + base64 thumbnail).
        const analysisResults = await Promise.all(
          attachments.map((a) => analyzeImage(a.path, a.name))
        );
        if (!analysisResults.some(Boolean)) {
          send({ type: "error", content: "Couldn't read any of the uploaded images from disk." });
          return;
        }
        const analyses = analysesForAttachments(attachments, analysisResults);

        // Stage 1 — vision pre-pass: describe each image in parallel so Gemma
        // writes captions grounded in what's actually on screen.
        let visionNotes: VisionNote[] = analyses.map((a) => ({
          path: a.path,
          subject: "",
          mood: "",
          palette: [a.dominant],
          brightness: a.brightness,
        }));
        if (useVision) {
          send({
            type: "status",
            text: `Vision pass · ${analyses.length} image(s) in ${Math.ceil(analyses.length / VISION_CHUNK_SIZE)} batch(es)…`,
          });
          const batchNotes = await describeImagesBatch(analyses, creative.captionTone);
          visionNotes = visionNotes.map((base, i) => batchNotes[i] ?? base);
          visionNotes.forEach((note) => send({ type: "vision_note", note }));
        } else {
          analyses.forEach((a, i) => {
            send({
              type: "vision_note",
              note: {
                path: a.path,
                subject: `Photo ${i + 1} (${a.name}) — Vision is off; turn it on for AI scene reads, or describe the roast in the prompt.`,
                mood: "",
                palette: [a.dominant],
                brightness: a.brightness,
              },
            });
          });
        }

        send({ type: "status", text: `Brain pass · creative director planning scenes…` });
        const { concept: reelConcept, brief: reelBrief } = await runBrainPass(
          userMessage,
          visionNotes,
          attachments,
          aspect,
          creative,
          targetDurationSec,
          effectiveMaxScenes
        );
        if (reelConcept.title) send({ type: "brain_concept", concept: reelConcept });
        if (reelBrief) send({ type: "director_brief", brief: reelBrief });

        send({ type: "status", text: `Composing captions (${targetDurationSec}s · ${pace} · director-guided)…` });

        const prompt = buildReelPrompt(
          userMessage,
          attachments,
          visionNotes,
          aspect,
          pace,
          effectiveMaxScenes,
          creative,
          targetDurationSec,
          reelBrief
        );
        let response = "";
        try {
          response = await streamOllama(
            prompt,
            (tok) => send({ type: "token", tok }),
            {
              temperature: reelJsonTemperature(creative),
              num_predict: reelJsonNumPredict(targetDurationSec),
            }
          );
        } catch (e) {
          send({ type: "error", content: `Ollama error: ${e}` });
          return;
        }

        const jsonStr = extractJson(response);
        if (!jsonStr) {
          send({ type: "error", content: "Gemma didn't output a JSON block. Try again." });
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          send({ type: "error", content: `Invalid JSON from Gemma: ${(e as Error).message}` });
          return;
        }

        const validPaths = new Set(attachments.map((a) => a.path));
        const copyLimits = copyLimitsForDuration(targetDurationSec);
        const reelIntent = detectCreativeIntent(userMessage);
        /** Comedy burns use the same anti–LinkedIn rules as explicit roasts. */
        const roastLikeCopy = reelIntent.isRoast || reelIntent.isComedy;
        const imageOrder = attachments.map((a) => a.path);

        let validation = validateReelSpec(parsed, validPaths, copyLimits, effectiveMaxScenes, {
          roastCopyCheck: roastLikeCopy,
          copyGuardTone: creative.captionTone,
          enforceImageOrder: imageOrder,
        });

        const repairableReel =
          !validation.ok &&
          /jargon|startup|duplicate|exactly|must use|only once|more\s+than|scenes has|required|not one of|banned phrases|thin copy/i.test(
            validation.error
          );

        if (repairableReel) {
          send({ type: "status", text: "Repair pass · fixing scene copy/order before TTS/render…" });
          const repaired = roastLikeCopy
            ? await repairReelJsonForRoast(
                JSON.stringify(parsed),
                userMessage,
                imageOrder
              )
            : await repairReelJsonForCopyGuard(
                JSON.stringify(parsed),
                userMessage,
                creative.captionTone,
                imageOrder
              );
          if (repaired) {
            try {
              parsed = JSON.parse(repaired);
              validation = validateReelSpec(parsed, validPaths, copyLimits, effectiveMaxScenes, {
                roastCopyCheck: roastLikeCopy,
                copyGuardTone: creative.captionTone,
                enforceImageOrder: imageOrder,
              });
            } catch {
              /* keep prior validation error */
            }
          }
        }

        if (!validation.ok) {
          send({ type: "error", content: `Schema error: ${validation.error}` });
          return;
        }
        const spec = validation.spec;

        const { sceneLen, transLen } = computeSceneTimingForTarget(
          targetDurationSec,
          spec.scenes.length,
          pace
        );

        // Derive a filename. If Gemma proposed a title, use it; otherwise hash
        // the image paths for a stable-ish unique name.
        const hash = attachments
          .map((a) => a.path.replace("uploads/", "").slice(0, 4))
          .join("")
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 8);
        const componentName = slugifyTitle(spec.title, hash || "Gen");
        const outPath = `remotion/compositions/${componentName}.tsx`;
        const fullOut = projectPath(outPath);

        // TTS narration pass (optional — only if Voicebox is running and user opted in)
        let sceneTTSPaths: string[] = [];
        if (useTTS) {
          send({ type: "tts_note", text: "Voicebox · checking connection…" });
          const profile = await resolveVoiceProfile(ttsVoice);
          if (profile) {
            if (profile.name.includes("Auto narration")) {
              send({
                type: "tts_note",
                text: "Voicebox · no saved voices — using preset narrator (same script as Gemma scenes)…",
              });
            }
            send({ type: "tts_note", text: `Voicebox · narrating with "${profile.name}"…` });
            sceneTTSPaths = await generateSceneTTS(
              spec.scenes,
              componentName,
              profile.id,
              (msg) => send({ type: "tts_note", text: msg }),
              profile.engine,
              creative.captionTone,
              creative.motionFeel,
              detectCreativeIntent(userMessage).isRoast,
            );
            const narrated = sceneTTSPaths.filter(Boolean).length;
            send({
              type: "tts_note",
              text:
                narrated > 0
                  ? `Voicebox · ${narrated} scene(s) narrated ✓`
                  : "Voicebox · no audio generated",
            });
          } else {
            send({
              type: "tts_note",
              text:
                "Voicebox unreachable or preset narrator failed — add a voice in Voicebox or set VOICEBOX_PRESET_ENGINE + VOICEBOX_PRESET_VOICE_ID",
            });
          }
        }

        const typo = REEL_TYPOGRAPHY[reelTypography];
        const tsxSource = renderReelComponent(componentName, spec, sceneLen, transLen, {
          captionFont: typo.captionFont,
          kickerFont: typo.kickerFont,
          decor: reelDecor,
          sceneTTSPaths: sceneTTSPaths.length > 0 ? sceneTTSPaths : undefined,
          gradePreset: autoGradePreset,
        });
        send({ type: "status", text: `Writing ${outPath}…` });
        fs.mkdirSync(path.dirname(fullOut), { recursive: true });
        fs.writeFileSync(fullOut, tsxSource, "utf-8");
        // Keep duration math in sync with CinematicReel.computeReelDuration.
        const OUTRO = 20;
        const duration =
          spec.scenes.length * sceneLen +
          OUTRO -
          Math.max(0, spec.scenes.length - 1) * transLen;

        // Validate BEFORE touching Root.tsx — broken wrappers must not corrupt the registry.
        send({ type: "status", text: "Verifying…" });
        const { ok, error } = quickValidate(fullOut);
        if (!ok) {
          try { fs.unlinkSync(fullOut); } catch { /* already gone */ }
          send({ type: "error", content: `TypeScript error in wrapper:\n${error}` });
          return;
        }

        registerInRoot(componentName, outPath, duration, w, h);

        // reel_spec is the authoritative event for structured reels — it carries
        // exact dimensions and duration so the client doesn't need file_written.
        send({
          type: "reel_spec",
          componentName,
          path: outPath,
          scenes: spec.scenes.length,
          durationInFrames: duration,
          title: spec.title,
          aspect,
          width: w,
          height: h,
          pace,
          sceneLen,
          transLen,
          targetDurationSec,
        });
        send({ type: "validation", success: true, output: "" });
        send({ type: "done" });
        return;
      }

      // ── Freeform TSX mode (no attachments) ───────────────────────────────
      const { w: cw, h: ch } = ASPECTS[aspect];
      const filePath = resolveFile(userMessage);
      let fileContent: string | null = null;
      const durationInFrames = Math.round(targetDurationSec * 30);

      if (filePath) {
        const full = projectPath(filePath);
        try {
          fileContent = fs.readFileSync(full, "utf-8");
          send({ type: "status", text: `Editing ${filePath}…` });
        } catch {
          send({ type: "status", text: `New file: ${filePath}` });
        }
      } else {
        send({
          type: "status",
          text: `New ${Math.round(durationInFrames / 30)}s composition · ${cw}×${ch} · ${creative.motionFeel} motion`,
        });
      }

      send({ type: "status", text: `Brain pass · creative director planning your composition…` });
      const { concept: freeformConcept, brief: freeformBrief } = await runBrainPass(
        userMessage,
        [],
        null,
        aspect,
        creative,
        targetDurationSec,
        maxScenes
      );
      if (freeformConcept.title) send({ type: "brain_concept", concept: freeformConcept });
      if (freeformBrief) send({ type: "director_brief", brief: freeformBrief });

      const prompt = buildPrompt(userMessage, filePath, fileContent, durationInFrames, creative, cw, ch, freeformBrief);
      const estTokens = Math.round(prompt.length / 4);
      send({ type: "status", text: `Gemma writing… (~${estTokens} tokens)` });

      let response = "";
      try {
        // Freeform TSX code-gen can produce large components — allow extra time.
        const freeformTimeout = Math.max(STREAM_TIMEOUT_MS, Math.round(targetDurationSec * 3_000));
        response = await streamOllama(prompt, (tok) => send({ type: "token", tok }), {
          temperature: freeformTemperature(creative),
          num_predict: freeformNumPredict(targetDurationSec),
          timeoutMs: freeformTimeout,
        });
      } catch (e) {
        send({ type: "error", content: `Ollama error: ${e}` });
        return;
      }

      const rawCode = extractCode(response);
      if (!rawCode) {
        send({ type: "error", content: "Gemma didn't output a code block. Rephrase and try again." });
        return;
      }
      const code = autofixCode(rawCode);

      const bad: { hit: boolean; msg: string }[] = [
        { hit: hasModuleLevelHook(code), msg: "hook at module level" },
        { hit: /motion\.[a-z]+/.test(code), msg: "framer-motion usage" },
        { hit: /fontSize:\s*['"]?\d+rem/.test(code), msg: "rem unit in style object (use numbers)" },
        { hit: /<Sequence[^>]+\bduration\s*=\s*\{/.test(code), msg: "wrong prop: use durationInFrames" },
      ];
      const firstBad = bad.find((b) => b.hit);
      if (firstBad) {
        send({ type: "error", content: `Invalid Remotion code: ${firstBad.msg}. Try again.` });
        return;
      }

      let outPath = filePath;
      if (!outPath) {
        const hint = response.match(/FILE:\s*(remotion\/[^\s\n]+)/);
        outPath = hint ? hint[1].trim() : "remotion/compositions/NewVideo.tsx";
      }

      const expectedName = path.basename(outPath, ".tsx");
      const normalized = normalizeExportName(code, expectedName);

      send({ type: "status", text: `Writing ${outPath}…` });
      const fullOut = projectPath(outPath);
      const backup = fs.existsSync(fullOut) ? fs.readFileSync(fullOut, "utf-8") : null;
      fs.mkdirSync(path.dirname(fullOut), { recursive: true });
      fs.writeFileSync(fullOut, normalized, "utf-8");
      send({ type: "file_written", path: outPath });

      // Validate BEFORE touching Root.tsx — restore backup or delete new file on failure.
      send({ type: "status", text: "Checking for errors…" });
      const { ok, error } = quickValidate(projectPath(outPath));
      if (!ok) {
        if (backup) {
          fs.writeFileSync(projectPath(outPath), backup, "utf-8");
        } else {
          try { fs.unlinkSync(projectPath(outPath)); } catch { /* already gone */ }
        }
        send({ type: "error", content: `TypeScript error in generated code:\n${error}` });
        return;
      }

      if (!filePath && outPath !== "remotion/Root.tsx") {
        const compName = path.basename(outPath, ".tsx");
        registerInRoot(compName, outPath, durationInFrames, cw, ch);
        send({
          type: "composition_meta",
          componentName: compName,
          durationInFrames,
          width: cw,
          height: ch,
          aspect,
          targetDurationSec,
        });
      }

      send({ type: "validation", success: ok, output: error });
      send({ type: "done" });
    } catch (unexpected: unknown) {
      const msg = unexpected instanceof Error ? unexpected.message : String(unexpected);
      send({ type: "error", content: `Agent error: ${msg}` });
    } finally {
      finishStream();
    }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
