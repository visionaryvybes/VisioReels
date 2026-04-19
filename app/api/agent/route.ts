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
import { renderHtmlSlidesToPng } from "@/lib/html-slide-render";
import { computeHtmlSlideVideoDuration } from "@/lib/html-slide-duration";
import type { ConceptBrief } from "@/lib/concept-brief";
import { parseDirectorBrief, briefToConceptCompat, type DirectorBrief } from "@/lib/director-brief";
import { buildContextQueries, fetchWebContext, formatWebContext } from "@/lib/web-context";
import { generateSpeech, resolveProfileForNarration } from "@/lib/voicebox";

const PROJECT_DIR = process.cwd();
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

async function streamOllama(
  prompt: string,
  onToken: (t: string) => void,
  opts: { temperature?: number; num_predict?: number } = {}
): Promise<string> {
  const call = (model: string) =>
    fetch(OLLAMA_URL, {
      method: "POST",
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
          repeat_penalty: 1.15,
        },
      }),
    });

  let res = await call(MODEL);
  if (res.status === 404 && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
    res = await call(FALLBACK_MODEL);
  }
  if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}`);

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
      } catch { /* skip */ }
    }
  }
  return full.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
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
  const full = path.join(PROJECT_DIR, "public", relPath);
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

async function callOllamaChat(messages: ChatMessage[], jsonMode: boolean): Promise<string> {
  // NOTE: Do NOT set think:false with format:"json" — Gemma 4 silently ignores the
  // format constraint when think is disabled (Ollama bug #15260). Omit think entirely
  // so JSON mode works correctly. Strip any <think>...</think> blocks in post-processing.
  const payload = {
    messages,
    stream: false,
    ...(jsonMode ? { format: "json" } : {}),
    options: {
      temperature: 0.4,
      top_p: 0.9,
      top_k: 40,
      repeat_penalty: 1.15,
      num_ctx: 16384,
      num_predict: 900,
    },
  };
  const call = (model: string) =>
    fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, model }),
    });
  let res = await call(MODEL);
  if (res.status === 404 && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) res = await call(FALLBACK_MODEL);
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const j = (await res.json()) as { message?: { content?: string } };
  // Strip <think>...</think> blocks that Gemma 4 emits in thinking mode
  const raw = j.message?.content ?? "";
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
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

function buildDirectorPrompt(
  userBrief: string,
  visionNotes: VisionNote[],
  aspect: string,
  creative: HyperframesCreativeProfile,
  targetSec: number,
  maxScenes: number,
  webContext?: string
): string {
  const visionBlock =
    visionNotes.length > 0
      ? `\nATTACHED IMAGES — use these for per-scene layout decisions:\n${visionNotes
          .filter((n) => n.subject)
          .map((n, i) => {
            const spatial = n.composition ? ` | composition: ${n.composition}` : "";
            const zone = n.text_zone ? ` | text_zone: ${n.text_zone}` : "";
            const ctype = n.content_type ? ` | type: ${n.content_type}` : "";
            const cstyle = n.copy_style ? ` | copy_style: ${n.copy_style}` : "";
            return `  ${i + 1}. ${n.subject} | mood: ${n.mood}${spatial}${zone}${ctype}${cstyle}`;
          })
          .join("\n")}`
      : "";

  const layoutMenu = `hud | editorial | typographic | split | orbital | data-grid | full-bleed | glitch | magazine`;
  const primMenu = `HUDCorners | StarField | GridOverlay | KineticTitle | TelemetryCounter | StatusBar | DataReadout | ScanLines | LightLeak`;
  const transMenu = `fade | slide-left | slide-right | slide-top | slide-bottom | flip | wipe | iris | clock-wipe`;

  return `You are the creative director AND art director for a ${targetSec}s video in ${aspect} format.
Your job: produce a COMPLETE pre-production brief that tells the motion designer (Gemma) EXACTLY what to build — scene by scene. Gemma does NOT make creative decisions. You do. Be specific. Be opinionated.

BRIEF: "${userBrief || "(images only — derive concept from visuals)"}"
MOTION FEEL: ${creative.motionFeel} | COPY TONE: ${creative.captionTone} | ENERGY: ${creative.transitionEnergy}
SCENES: up to ${maxScenes}${visionBlock}

${PRIMITIVES_CATALOG}

Respond with ONE JSON object ONLY — no explanation, no markdown fence:

{
  "title": "short punchy video title (≤30 chars)",
  "logline": "one sentence: what story does this video tell?",
  "hook": "describe the EXACT first 2 seconds — what's on screen and what does the first line of copy say?",
  "palette": {
    "bg": "#hex — primary background",
    "text": "#hex — primary text color",
    "accent": "#hex — signature accent (for HUD elements, underlines, highlights)",
    "secondary": "#hex — secondary accent"
  },
  "typography": {
    "headline_font": "exact Google Font name e.g. Space Grotesk",
    "mono_font": "exact monospace Google Font e.g. JetBrains Mono",
    "style_note": "e.g. bold display + light mono contrast"
  },
  "motion_language": "concise motion description e.g. weighted expo.out deceleration, no bounce, precise",
  "overall_energy": "low | medium | high",
  "scenes": [
    {
      "index": 0,
      "layout": "${layoutMenu}",
      "bg": "hex or CSS gradient string",
      "headline": "EXACT headline text shown on screen (make it powerful, specific, not generic)",
      "kicker": "EXACT mono kicker label e.g. 'PHASE 01 · LAUNCH' or '00:23:56 · T+MISSION'",
      "body": "optional supporting copy (1 short sentence max)",
      "accent": "#hex for this scene",
      "secondary": "#hex optional",
      "data_points": [{"label":"ALTITUDE","value":"183","unit":"km"}],
      "primitives": ["${primMenu}"],
      "transition": "${transMenu}",
      "motion_note": "e.g. 'stagger 4fr per word, slide-up; HUDCorners reveal at frame 0; counter runs 0→183 over 45fr'"
    }
  ]
}

RULES:
- scenes.length must be between 2 and ${maxScenes}
- Every headline must be SPECIFIC to the brief — never generic ("Explore Now", "Amazing Journey")
- Pick primitives that match the layout: hud → HUDCorners + DataReadout; typographic → KineticTitle; data-grid → GridOverlay + TelemetryCounter
- Vary layouts scene to scene — don't repeat the same layout twice in a row
- For scenes with attached images: choose layout + text_zone based on the composition field — if text_zone=bottom-left, anchor headline bottom-left, leave subject visible; if text_zone=right-panel, use split layout with text on right
- For interior/architecture/product images: copy_style guides the headline tone — "luxury" → aspirational editorial; "tech" → data/spec-driven; "fashion" → attitude statement
- Headlines should reference what's IN the image (the specific room, product, person, scene) not generic copy
- For ${creative.captionTone} tone: ${
    creative.captionTone === "hype" ? "ALL-CAPS power words, 1-3 word punches, kinetic energy"
    : creative.captionTone === "corporate" ? "Title Case benefit lines, confident, data-backed"
    : creative.captionTone === "storytelling" ? "evocative fragments, cinematic, emotional resonance"
    : creative.captionTone === "tutorial" ? "step labels, numbered, instructional clarity"
    : "scroll-stopping hooks, native social phrasing"
  }
- For ${creative.motionFeel} motion: ${
    creative.motionFeel === "dramatic" ? "no bounce, expo.out long ramp, stillness before action"
    : creative.motionFeel === "snappy" ? "short stiff springs, decisive, controlled"
    : creative.motionFeel === "dreamy" ? "sine ease, symmetrical, floaty timing"
    : creative.motionFeel === "bouncy" ? "overshoot spring, playful, energetic"
    : "smooth deceleration, luxury pacing"
  }${webContext ? `\n\n${webContext}` : ""}`;
}

async function runBrainPass(
  userBrief: string,
  visionNotes: VisionNote[],
  aspect: string,
  creative: HyperframesCreativeProfile,
  targetSec: number,
  maxScenes: number
): Promise<{ concept: ConceptBrief; brief: DirectorBrief | null }> {
  // Fetch real-world context (design trends, domain vocabulary) to inject into the director brief.
  // This gives Gemma grounded copy ideas rather than generic filler. Fails silently if offline.
  const contentTypes = visionNotes.map((n) => n.content_type ?? "").filter(Boolean);
  const copyStyles = visionNotes.map((n) => n.copy_style ?? "").filter(Boolean);
  const webQueries = buildContextQueries(userBrief, contentTypes, copyStyles);
  const webContextItems = await fetchWebContext(webQueries);
  const webContext = formatWebContext(webContextItems);

  const prompt = buildDirectorPrompt(userBrief, visionNotes, aspect, creative, targetSec, maxScenes, webContext);
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
 * Batch vision — send up to 6 images in ONE Gemma call, get back an array.
 * Replaces N sequential describeImage calls with a single round-trip.
 * For images beyond the batch cap, returns bare-stats fallbacks.
 */
const VISION_BATCH_CAP = 6;

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

async function describeImagesBatch(
  analyses: ImageStats[],
  captionTone?: HyperframesCaptionTone
): Promise<VisionNote[]> {
  const batch = analyses.slice(0, VISION_BATCH_CAP);
  const n = batch.length;
  const toneHint = captionTone ? `\nCopy tone: "${captionTone}".` : "";

  const prompt = `You are an art director. Analyze these ${n} photos IN ORDER (image 1, image 2, …) and return a JSON object.

Return exactly: {"notes": [array of ${n} objects, one per photo in order]}

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
Return ONLY the JSON. No prose.`;

  try {
    const raw = await callOllamaChat(
      [{ role: "user", content: prompt, images: batch.map((a) => a.base64) }],
      true
    );
    const parsed = safeJson(raw) as Record<string, unknown> | null;
    const notes = Array.isArray(parsed?.notes) ? (parsed!.notes as Record<string, unknown>[]) : null;

    // Map results back to analyses — fallback per-image if array is short/missing
    return batch.map((a, i) => {
      const entry = notes?.[i] ?? null;
      return extractVisionNote(entry as Record<string, unknown> | null, a);
    });
  } catch {
    return batch.map((a) => ({ path: a.path, subject: "", mood: "", palette: [a.dominant], brightness: a.brightness }));
  }
}

function safeJson(raw: string): unknown | null {
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch { return null; }
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
  const remixBlock = buildReelRemixDirective(attachments.length, maxScenes);
  const longForm = targetDurationSec >= 45;
  const lingoBlock = `═══ TARGET RUNTIME: ${targetDurationSec} seconds (~${targetDurationSec * 30} frames @ 30fps) ═══
Scene holds will be tuned to fill this length. Write copy that earns the full runtime:
- Social-native voice when tone is hype/social: hooks that sound like Reels/TikTok/Shorts (e.g. "POV:", "wait for it", "save this", "link in bio") only when on-brand — no empty filler.
- Corporate/tutorial: crisp value props and step cues — still scannable on mobile.
- ${longForm ? `LONG RUN (${targetDurationSec}s): use the full kicker budget (≤${kickerMax} chars) for story beats, curiosity, payoff; vary phrasing scene-to-scene.` : `Short run: captions stay razor-tight; kicker optional.`}
`;

  // Director brief block — pre-planned copy from the brain pass. When present,
  // Gemma must use the EXACT headline/kicker/accent per scene index (not invent new).
  const directorBlock = brief?.scenes.length
    ? `═══ DIRECTOR BRIEF — copy approved. Use verbatim. ═══
${brief.scenes.slice(0, maxScenes).map((s, i) =>
  `  Scene ${i + 1}: caption="${s.headline}" | kicker="${s.kicker}" | accent="${s.accent}"`
).join("\n")}

STRICT RULE: The caption and kicker above are APPROVED copy — paste them verbatim into the JSON. Do NOT invent new captions. You may still choose the src (image path) and transition freely.
`
    : "";

  return `You are a video art director generating a JSON scene plan for a ${aspectMeta.label} reel.
Pace: ${pace.toUpperCase()} — ${paceMeta.blurb}.

${creativeBlock}
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
      "transition": ${transitionList}   (optional)
    }
  ]
}

═══ AVAILABLE IMAGES (use these EXACT strings in "src") ═══
${imgList}

═══ RULES ═══
- scenes.length must be between 2 and ${maxScenes} (remix: same src may repeat — see REMIX block)
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
    return `═══ DIRECTOR BRIEF — execute these slide specs exactly ═══
Palette: bg=${brief.palette.bg} · text=${brief.palette.text} · accent=${brief.palette.accent}
Headline font: ${brief.typography.headline_font} · Mono font: ${brief.typography.mono_font}
Motion language: ${brief.motion_language}

${sceneLines}

EXECUTION RULES:
- Use the EXACT headline and kicker text from each slide spec above — do not paraphrase
- Match the bg and accent hex values per slide
- For "hud" or "data-grid" layouts: render data overlays as styled <div> blocks with the mono font + accent color — e.g. a metric label in small-caps + large numeric value
- For "typographic" or "editorial": large display type contrast is the hero; use the headline font at 120px+
- For "magazine": thin horizontal rules, small-caps metadata labels, structured grid
- Each slide must have distinct visual identity — vary layout, type scale, and color emphasis
`;
  })() : "";

  return `You are a senior motion designer + art director. The user wants a video made of separate HTML slides, each rendered as a PNG (${w}×${h}px).

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
2. STRUCTURE LAYER: geometric elements that frame the composition
   - Thin 1px horizontal rules (top + bottom of text zone)
   - Corner brackets via border-top + border-left on positioned divs (mission control style)
   - SVG grid, arc, circle, or orbital path
   - Data readout blocks: small-caps label + large mono value + accent color
3. TYPOGRAPHY LAYER: intentional scale contrast
   - Dominant headline: 100-180px, tight tracking (-0.03em to -0.05em), bold weight
   - Kicker/label: 13-18px, 0.2em letter-spacing, uppercase, 55% opacity, mono font
   - Supporting copy: 22-28px, readable weight, 1.4-1.6 line-height

═══ LAYOUT PATTERNS (pick one per slide, vary across the deck) ═══
- EDITORIAL: large headline top-left, thin rule below, small kicker left-aligned, whitespace dominant
- HUD/DATA: dark bg, HUD corner brackets, 2-4 metric blocks (label/value/unit), status bar bottom
- MAGAZINE: cream bg, black type, thin rules framing sections, page number bottom-right
- SPLIT: left 55% image or gradient, right 45% text panel with solid bg
- TYPOGRAPHIC: headline fills 70% of slide, contrasting italic or weight shift on key word
- CINEMATIC: full-bleed gradient, centered headline with glow, thin ornamental line

HyperFrames shader vocabulary (inspire visual language — these are the transition moods):
domain-warp · ridged-burn · whip-pan · sdf-iris · ripple-waves · gravitational-lens ·
cinematic-zoom · chromatic-split · glitch · swirl-vortex · thermal-distortion · flash-through-white · cross-warp-morph · light-leak

CREATIVE DIRECTIVE:
- Motion feel: ${creative.motionFeel}
- Caption / copy tone: ${creative.captionTone}
- Target vibe: ~${targetSec}s total.

VISUAL RICHNESS — each slide must have at least 3 layers:
1. Background: gradient or full-bleed image — never flat solid unless brief demands it
2. Structural elements: thin rules (1px), corner brackets (via border), SVG geometry, grid lines, or a gradient band
3. Typography: headline at display size + mono label/kicker in contrasting scale
For "hud" / "data-grid" slides: add 2-4 metric blocks with monospace font — label (small, 0.15em tracking, uppercase, 50% opacity) + value (large, bold, accent color)

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

function validateReelSpec(
  raw: unknown,
  validPaths: Set<string>,
  limits?: { captionMax: number; kickerMax: number },
  maxSceneCount = 16
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
    });
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
  opts: { captionFont: string; kickerFont: string; decor: ReelDecorId; sceneTTSPaths?: string[] }
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
    return `${hfBlock}\n\n${codeVisualBlock}\n\n${rules}\n${primitivesImportLine}\n- ${determinism}\n\n${layoutSafety}\n\n${strictFormat}${directorBlock}\n\nCURRENT FILE (${filePath}):\n\`\`\`tsx\n${trimmed}\n\`\`\`\n\nTASK: ${userRequest}\n\n${runtimeCopyBlock}\n\nOutput the COMPLETE modified file in a single \`\`\`tsx block. No explanations.`;
  }

  return `${hfBlock}\n\n${codeVisualBlock}\n\n${rules}\n${primitivesImportLine}\n\n${layoutSafety}\n\n${strictFormat}${directorBlock}\n\nTASK: ${userRequest}\n\nSPECS: ${secs}s = ${durationInFrames}fr @ ${fps}fps, canvas ${canvasW}×${canvasH} (${orient}) — match this composition size in all layout math.\n${runtimeCopyBlock}\nUse <Sequence> or <TransitionSeries> for multiple scenes with cinematic transitions aligned to the creative directive.\n\nOutput format (exactly this shape, nothing else):\n\`\`\`tsx\nimport { useCurrentFrame, ... } from "remotion";\nexport const YourComponentName: React.FC = () => { ... };\n\`\`\`\nFILE: remotion/compositions/YourComponentName.tsx`;
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
  const rootPath = path.join(PROJECT_DIR, "remotion/Root.tsx");
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

async function generateSceneTTS(
  scenes: Array<{ caption: string; kicker?: string }>,
  componentName: string,
  profileId: string,
  onProgress: (msg: string) => void,
  engine?: string
): Promise<string[]> {
  const publicDir = path.join(PROJECT_DIR, "public", "tts");
  fs.mkdirSync(publicDir, { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    // Combine caption + kicker for narration
    const text = [scene.caption, scene.kicker].filter(Boolean).join(". ").trim();
    if (!text) { paths.push(""); continue; }

    const filename = `${componentName}-scene-${i}.wav`;
    const outputPath = path.join(publicDir, filename);
    onProgress(`TTS scene ${i + 1}/${scenes.length}…`);

    const ok = await generateSpeech({ text, profileId, outputPath, engine });
    paths.push(ok ? `tts/${filename}` : "");
  }
  return paths;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route
// ═══════════════════════════════════════════════════════════════════════════════

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
      const send = (ev: Record<string, unknown>) =>
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

      // ── HTML slide video (Gemma → ---SLIDE--- HTML → Playwright PNG → HtmlSlideVideo) ──
      if (pipeline === "hyperframes") {
        const { w, h, label } = ASPECTS[aspect];
        const slideCap = Math.min(maxScenes, 10);
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
          const analyses: ImageStats[] = analysisResults.filter(
            (s): s is ImageStats => s !== null
          );
          if (!analyses.length) {
            send({ type: "error", content: "Couldn't read any of the uploaded images from disk." });
            ctrl.close();
            return;
          }
          visionNotes = analyses.map((a) => ({
            path: a.path,
            subject: "",
            mood: "",
            palette: [a.dominant],
            brightness: a.brightness,
          }));
          if (useVision) {
            const batchCap = Math.min(analyses.length, VISION_BATCH_CAP);
            send({ type: "status", text: `Vision pass · reading ${batchCap} image(s) in batch…` });
            const batchNotes = await describeImagesBatch(analyses, creative.captionTone);
            visionNotes = visionNotes.map((base, i) => batchNotes[i] ?? base);
            visionNotes.forEach((note) => send({ type: "vision_note", note }));
          }
        }

        send({ type: "status", text: `Brain pass · creative director planning your video…` });
        const { concept: hfConcept, brief: hfBrief } = await runBrainPass(userMessage, visionNotes, aspect, creative, targetDurationSec, slideCap);
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
        let response = "";
        try {
          response = await streamOllama(
            prompt,
            (tok) => send({ type: "token", tok }),
            {
              temperature: 0.35,
              num_predict: numPredict,
            }
          );
        } catch (e) {
          send({ type: "error", content: `Ollama error: ${e}` });
          ctrl.close();
          return;
        }
        const slides = parseHtmlSlidesFromGemma(response);
        if (!slides.length) {
          send({
            type: "error",
            content:
              "Couldn't read any slides from Gemma. It should output HTML separated by lines containing only ---SLIDE--- (or legacy JSON {\"slides\":[...]}). Try fewer slides / shorter copy, or run again.",
          });
          ctrl.close();
          return;
        }
        send({
          type: "status",
          text: `Rendering ${slides.length} slide(s) to PNG (Chromium)…`,
        });
        const publicDir = path.join(PROJECT_DIR, "public");
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
          ctrl.close();
          return;
        }
        // TTS narration for HYPERFRAMES — use director brief scene headlines as script
        let hfNarrationPaths: string[] = [];
        if (useTTS && hfBrief?.scenes.length) {
          send({ type: "tts_note", text: "Voicebox · checking connection…" });
          const hfProfile = await resolveProfileForNarration(ttsVoice);
          if (hfProfile) {
            if (hfProfile.name.includes("Auto narration")) {
              send({
                type: "tts_note",
                text: "Voicebox · no saved voices — using preset narrator (same script as Gemma brief)…",
              });
            }
            send({ type: "tts_note", text: `Voicebox · narrating slides with "${hfProfile.name}"…` });
            hfNarrationPaths = await generateSceneTTS(
              hfBrief.scenes.map((s) => ({ caption: s.headline, kicker: s.kicker })),
              `HtmlSlides-${renderResult.jobId}`,
              hfProfile.id,
              (msg) => send({ type: "tts_note", text: msg }),
              hfProfile.engine
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
        ctrl.close();
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
        const analyses: ImageStats[] = analysisResults.filter(
          (s): s is ImageStats => s !== null
        );
        if (!analyses.length) {
          send({ type: "error", content: "Couldn't read any of the uploaded images from disk." });
          ctrl.close();
          return;
        }

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
          const batchCap = Math.min(analyses.length, VISION_BATCH_CAP);
          send({ type: "status", text: `Vision pass · reading ${batchCap} image(s) in batch…` });
          const batchNotes = await describeImagesBatch(analyses, creative.captionTone);
          visionNotes = visionNotes.map((base, i) => batchNotes[i] ?? base);
          visionNotes.forEach((note) => send({ type: "vision_note", note }));
        }

        send({ type: "status", text: `Brain pass · creative director planning scenes…` });
        const { concept: reelConcept, brief: reelBrief } = await runBrainPass(userMessage, visionNotes, aspect, creative, targetDurationSec, maxScenes);
        if (reelConcept.title) send({ type: "brain_concept", concept: reelConcept });
        if (reelBrief) send({ type: "director_brief", brief: reelBrief });

        send({ type: "status", text: `Composing captions (${targetDurationSec}s · ${pace} · director-guided)…` });

        const prompt = buildReelPrompt(
          userMessage,
          attachments,
          visionNotes,
          aspect,
          pace,
          maxScenes,
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
          ctrl.close();
          return;
        }

        const jsonStr = extractJson(response);
        if (!jsonStr) {
          send({ type: "error", content: "Gemma didn't output a JSON block. Try again." });
          ctrl.close();
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          send({ type: "error", content: `Invalid JSON from Gemma: ${(e as Error).message}` });
          ctrl.close();
          return;
        }

        const validPaths = new Set(attachments.map((a) => a.path));
        const copyLimits = copyLimitsForDuration(targetDurationSec);
        const validation = validateReelSpec(parsed, validPaths, copyLimits, maxScenes);
        if (!validation.ok) {
          send({ type: "error", content: `Schema error: ${validation.error}` });
          ctrl.close();
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
        const fullOut = path.join(PROJECT_DIR, outPath);

        // TTS narration pass (optional — only if Voicebox is running and user opted in)
        let sceneTTSPaths: string[] = [];
        if (useTTS) {
          send({ type: "tts_note", text: "Voicebox · checking connection…" });
          const profile = await resolveProfileForNarration(ttsVoice);
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
              profile.engine
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
          ctrl.close();
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
        ctrl.close();
        return;
      }

      // ── Freeform TSX mode (no attachments) ───────────────────────────────
      const { w: cw, h: ch } = ASPECTS[aspect];
      const filePath = resolveFile(userMessage);
      let fileContent: string | null = null;
      const durationInFrames = Math.round(targetDurationSec * 30);

      if (filePath) {
        const full = path.join(PROJECT_DIR, filePath);
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
      const { concept: freeformConcept, brief: freeformBrief } = await runBrainPass(userMessage, [], aspect, creative, targetDurationSec, maxScenes);
      if (freeformConcept.title) send({ type: "brain_concept", concept: freeformConcept });
      if (freeformBrief) send({ type: "director_brief", brief: freeformBrief });

      const prompt = buildPrompt(userMessage, filePath, fileContent, durationInFrames, creative, cw, ch, freeformBrief);
      const estTokens = Math.round(prompt.length / 4);
      send({ type: "status", text: `Gemma writing… (~${estTokens} tokens)` });

      let response = "";
      try {
        response = await streamOllama(prompt, (tok) => send({ type: "token", tok }), {
          temperature: freeformTemperature(creative),
          num_predict: freeformNumPredict(targetDurationSec),
        });
      } catch (e) {
        send({ type: "error", content: `Ollama error: ${e}` });
        ctrl.close();
        return;
      }

      const rawCode = extractCode(response);
      if (!rawCode) {
        send({ type: "error", content: "Gemma didn't output a code block. Rephrase and try again." });
        ctrl.close();
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
        ctrl.close();
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
      const fullOut = path.join(PROJECT_DIR, outPath);
      const backup = fs.existsSync(fullOut) ? fs.readFileSync(fullOut, "utf-8") : null;
      fs.mkdirSync(path.dirname(fullOut), { recursive: true });
      fs.writeFileSync(fullOut, normalized, "utf-8");
      send({ type: "file_written", path: outPath });

      // Validate BEFORE touching Root.tsx — restore backup or delete new file on failure.
      send({ type: "status", text: "Checking for errors…" });
      const { ok, error } = quickValidate(path.join(PROJECT_DIR, outPath));
      if (!ok) {
        if (backup) {
          fs.writeFileSync(path.join(PROJECT_DIR, outPath), backup, "utf-8");
        } else {
          try { fs.unlinkSync(path.join(PROJECT_DIR, outPath)); } catch { /* already gone */ }
        }
        send({ type: "error", content: `TypeScript error in generated code:\n${error}` });
        ctrl.close();
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
      ctrl.close();
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
