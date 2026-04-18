import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import * as ts from "typescript";

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

function pickAudio(r: string): string {
  const l = r.toLowerCase();
  if (l.includes("neon") || l.includes("cyber")) return "audio/music-neon.wav";
  if (l.includes("dark") || l.includes("moody") || l.includes("dramatic")) return "audio/music-dark-moody.wav";
  if (l.includes("minimal") || l.includes("calm")) return "audio/music-minimal.wav";
  if (l.includes("vibrant") || l.includes("hype") || l.includes("energy")) return "audio/music-vibrant.wav";
  return "audio/music-cinematic.wav";
}

function needsAudio(r: string): boolean {
  return /music|audio|sound|soundtrack/i.test(r);
}

function needsImages(r: string): boolean {
  return /image|photo|picture|visual|background|unsplash|drone|aerial/i.test(r);
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
        options: {
          temperature: opts.temperature ?? 0.1,
          top_p: 0.9,
          num_ctx: 16384,
          num_predict: opts.num_predict ?? 4096,
          num_thread: 8,
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
  return full;
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

/** HyperFrames prompt-guide vocabulary → Gemma instructions (we still render in Remotion). */
type MotionFeel = "smooth" | "snappy" | "bouncy" | "dramatic" | "dreamy";
type CaptionTone = "hype" | "corporate" | "tutorial" | "storytelling" | "social";
type TransitionEnergy = "calm" | "medium" | "high";

interface CreativeProfile {
  motionFeel: MotionFeel;
  captionTone: CaptionTone;
  transitionEnergy: TransitionEnergy;
}

function parseCreativeProfile(body: {
  motionFeel?: unknown;
  captionTone?: unknown;
  transitionEnergy?: unknown;
}): CreativeProfile {
  const motionFeel: MotionFeel =
    body.motionFeel === "smooth" ||
    body.motionFeel === "snappy" ||
    body.motionFeel === "bouncy" ||
    body.motionFeel === "dramatic" ||
    body.motionFeel === "dreamy"
      ? body.motionFeel
      : "snappy";
  const captionTone: CaptionTone =
    body.captionTone === "hype" ||
    body.captionTone === "corporate" ||
    body.captionTone === "tutorial" ||
    body.captionTone === "storytelling" ||
    body.captionTone === "social"
      ? body.captionTone
      : "hype";
  const transitionEnergy: TransitionEnergy =
    body.transitionEnergy === "calm" || body.transitionEnergy === "medium" || body.transitionEnergy === "high"
      ? body.transitionEnergy
      : "medium";
  return { motionFeel, captionTone, transitionEnergy };
}

function buildHyperframesCreativeBlock(c: CreativeProfile): string {
  const motionLines: Record<MotionFeel, string> = {
    smooth: "Motion feel: SMOOTH — natural deceleration, luxury pacing, no harsh pops.",
    snappy: "Motion feel: SNAPPY — quick decisive settles, short beats, confident.",
    bouncy: "Motion feel: BOUNCY — playful overshoot energy (think scale-pop on key words).",
    dramatic: "Motion feel: DRAMATIC — long glide, strong contrast between stillness and motion.",
    dreamy: "Motion feel: DREAMY — floaty, symmetrical, slow symmetrical reveals.",
  };
  const captionLines: Record<CaptionTone, string> = {
    hype: "Caption tone: HYPE — heavy impact, 1–2 uppercase power words, kinetic social energy.",
    corporate: "Caption tone: CORPORATE — clear title-case headlines, trustworthy, minimal slang.",
    tutorial: "Caption tone: TUTORIAL — instructional, step-by-step vibe, monospace-friendly phrasing in kickers.",
    storytelling: "Caption tone: STORYTELLING — evocative, cinematic, emotional hook in the kicker.",
    social: "Caption tone: SOCIAL — scroll-stopping, playful, platform-native (no emoji unless user asked).",
  };
  const transLines: Record<TransitionEnergy, string> = {
    calm: "Transition energy: CALM — prefer fade; slide-bottom for gentle reveals; avoid harsh wipes.",
    medium: "Transition energy: MEDIUM — mix slide-left/right and flip; one kinetic beat per scene change.",
    high: "Transition energy: HIGH — prefer wipe, flip, aggressive slide-*; punchy cuts between scenes.",
  };
  return `═══ CREATIVE DIRECTIVE (HyperFrames-style vocabulary) ═══
${motionLines[c.motionFeel]}
${captionLines[c.captionTone]}
${transLines[c.transitionEnergy]}
Map transitions to JSON "transition" field: slide-right | slide-left | slide-top | slide-bottom | flip | fade | wipe.
`;
}

function reelJsonTemperature(c: CreativeProfile): number {
  let t = 0.3;
  if (c.transitionEnergy === "high") t += 0.04;
  if (c.captionTone === "social" || c.captionTone === "hype") t += 0.03;
  if (c.motionFeel === "bouncy" || c.motionFeel === "dramatic") t += 0.02;
  return Math.min(0.45, t);
}

/** Slightly warmer beam for freeform TSX when creative controls ask for variety. */
function freeformTemperature(c: CreativeProfile): number {
  let t = 0.1;
  if (c.transitionEnergy === "high") t += 0.04;
  if (c.captionTone === "social" || c.captionTone === "hype") t += 0.04;
  if (c.motionFeel === "bouncy" || c.motionFeel === "dramatic") t += 0.03;
  return Math.min(0.22, t);
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
  return Math.min(8192, Math.round(1600 + targetSec * 28));
}

function freeformNumPredict(targetSec: number): number {
  return Math.min(16384, Math.round(2800 + targetSec * 55));
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
  base64: string;       // 384px JPEG, no data-URI prefix
}

interface VisionNote {
  path: string;
  subject: string;
  mood: string;
  palette: string[];
  brightness: number;
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
      .resize(384, 384, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 60 })
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
  const payload = {
    messages,
    stream: false,
    think: false,
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
  return j.message?.content ?? "";
}

async function describeImage(a: ImageStats, captionTone?: CaptionTone): Promise<VisionNote> {
  const toneLine = captionTone
    ? `The editor wants on-screen copy with a "${captionTone}" voice — note mood/lighting that supports that tone (e.g. hype vs corporate vs story).`
    : "";
  const prompt = `You are a cinematographer scouting a shot. Look at this photo and respond with ONE JSON object:
{
  "subject": string   // one concrete sentence: WHAT / WHO is in the frame and what are they doing?
  "mood":    string   // 1-3 words (e.g. "serene dusk", "chaotic neon", "gritty industrial")
  "palette": string[] // 3 hex colours you see in the photo
}
${toneLine}
Return ONLY the JSON — no prose, no markdown.`;
  try {
    const raw = await callOllamaChat(
      [{ role: "user", content: prompt, images: [a.base64] }],
      true
    );
    const parsed = safeJson(raw) as Partial<VisionNote> | null;
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
    };
  } catch {
    return { path: a.path, subject: "", mood: "", palette: [a.dominant], brightness: a.brightness };
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
  creative: CreativeProfile,
  targetDurationSec: number
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
      return `  ${i + 1}. "${a.path}"   (${a.name})
       · subject : ${note.subject}
       · mood    : ${note.mood || "—"} · ${brightTag}
       · palette : ${paletteStr || "—"}`;
    })
    .join("\n");

  const transitionList = VALID_TRANSITIONS.map((t) => `"${t}"`).join(" | ");
  const aspectMeta = ASPECTS[aspect];
  const paceMeta = PACE[pace];
  const creativeBlock = buildHyperframesCreativeBlock(creative);
  const longForm = targetDurationSec >= 45;
  const lingoBlock = `═══ TARGET RUNTIME: ${targetDurationSec} seconds (~${targetDurationSec * 30} frames @ 30fps) ═══
Scene holds will be tuned to fill this length. Write copy that earns the full runtime:
- Social-native voice when tone is hype/social: hooks that sound like Reels/TikTok/Shorts (e.g. "POV:", "wait for it", "save this", "link in bio") only when on-brand — no empty filler.
- Corporate/tutorial: crisp value props and step cues — still scannable on mobile.
- ${longForm ? `LONG RUN (${targetDurationSec}s): use the full kicker budget (≤${kickerMax} chars) for story beats, curiosity, payoff; vary phrasing scene-to-scene.` : `Short run: captions stay razor-tight; kicker optional.`}
`;

  return `You are a video art director generating a JSON scene plan for a ${aspectMeta.label} reel.
Pace: ${pace.toUpperCase()} — ${paceMeta.blurb}.

${creativeBlock}
${lingoBlock}
═══ OUTPUT CONTRACT ═══
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
- scenes.length must be between 2 and ${Math.min(attachments.length, maxScenes)}
- Every scene.src MUST be one of the paths above — copied letter-for-letter
- Use each available image AT MOST once unless the user asked otherwise
- Captions MUST be grounded in the subject/mood of that specific image — never generic
- Caption + kicker MUST follow the CREATIVE DIRECTIVE caption tone above (hype vs corporate vs tutorial vs storytelling vs social).
- ONE powerful word beats two when tone is hype/social and runtime is short; for longer runtimes, richer headlines are OK within caption char limit.
- Kicker amplifies the caption (≤${kickerMax} chars) — poetic or punchy per tone; for corporate, a clean subtitle line.
- Accent should match the photograph's dominant mood (use the palette hints above if helpful):
    action / fire    → #ff3d3d, #ff8a2a
    warmth / gold    → #ffd43a, #ffb72a
    nature / growth  → #54d38f, #6cd97a
    sky / water      → #4cc9ff, #8ab4ff
    magic / twilight → #a78bfa, #ff6fb5
- Transition kinds suit pacing: slide-* = kinetic, flip = reveal, wipe = punchy, fade = calm
- Vary transitions scene-to-scene; avoid using the same one twice in a row
- For ${pace.toUpperCase()} pace, prefer: ${
    pace === "hype"   ? "slide-*, wipe (kinetic cuts)"
  : pace === "fast"   ? "slide-*, flip, wipe"
  : pace === "chill"  ? "fade, slide-bottom (slow reveals)"
  :                     "a mix — lean on fades + slides"
}

═══ USER REQUEST ═══
${userRequest.trim()}

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

function validateReelSpec(
  raw: unknown,
  validPaths: Set<string>,
  limits?: { captionMax: number; kickerMax: number }
): { ok: true; spec: ReelSpec } | { ok: false; error: string } {
  const captionMax = limits?.captionMax ?? 36;
  const kickerMax = limits?.kickerMax ?? 56;
  if (!raw || typeof raw !== "object") return { ok: false, error: "response is not an object" };
  const obj = raw as Record<string, unknown>;
  const scenes = obj.scenes;
  if (!Array.isArray(scenes)) return { ok: false, error: "scenes must be an array" };
  if (scenes.length < 1) return { ok: false, error: "scenes must not be empty" };
  if (scenes.length > 10) return { ok: false, error: "scenes has more than 10 entries" };

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
  transLen: number
): string {
  const json = JSON.stringify(spec.scenes, null, 2);
  // Indent the JSON to 6 spaces to match the JSX column for readability.
  const indentedJson = json
    .split("\n")
    .map((line, i) => (i === 0 ? line : `      ${line}`))
    .join("\n");
  const brand = JSON.stringify(spec.brandName ?? "VISIO●REEL");

  return `import React from "react";
import { CinematicReel } from "../components/CinematicReel";

// Auto-generated by /api/agent. Do not edit by hand — re-run the agent instead.
export const ${componentName}: React.FC = () => {
  return (
    <CinematicReel
      brandName={${brand}}
      sceneLengthInFrames={${sceneLen}}
      transitionLengthInFrames={${transLen}}
      scenes={${indentedJson}}
    />
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

function buildPrompt(
  userRequest: string,
  filePath: string | null,
  fileContent: string | null,
  durationInFrames: number,
  audioFile: string | null,
  creative: CreativeProfile,
  canvasW: number,
  canvasH: number
): string {
  const audio = audioFile
    ? `<Audio src={staticFile("${audioFile}")} volume={0.28} />`
    : "";

  const imagesImportNeeded = needsImages(userRequest);
  const staticFileImportNeeded = !!audioFile;

  const hfBlock = buildHyperframesCreativeBlock(creative);

  const motionSpringHints: Record<MotionFeel, string> = {
    smooth: "Prefer spring({ config: { damping: 22, stiffness: 90 } }) for smooth deceleration.",
    snappy: "Prefer spring({ config: { damping: 16, stiffness: 200 } }) for snappy motion.",
    bouncy: "Prefer spring({ config: { damping: 10, stiffness: 180 } }) with slight overshoot for bouncy feel.",
    dramatic: "Use interpolate with Easing.bezier or Easing.out(Easing.cubic) for long dramatic ramps.",
    dreamy: "Use interpolate with Easing.inOut(Easing.sine) for dreamy symmetrical motion.",
  };

  const determinism = `DETERMINISM (HyperFrames-inspired — same render every frame):
- NEVER use Math.random(). If you need variation, use mulberry32(seed) or derive from useCurrentFrame().
- Every animated element needs predictable frame-based math (interpolate/spring).`;

  const rules = `REMOTION RULES — follow exactly:
- Hooks (useCurrentFrame, useVideoConfig) ONLY inside functional components, never at module level
- Animations: spring() or interpolate() only — NO framer-motion, NO CSS transitions
- Imports: import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing, AbsoluteFill, Sequence${needsAudio(userRequest) ? ", Audio" : ""}${staticFileImportNeeded ? ", staticFile" : ""}${imagesImportNeeded ? ", Img" : ""} } from "remotion"
- For slide transitions: import { TransitionSeries, springTiming } from "@remotion/transitions"
- Word animations: spring({ frame: Math.max(0, frame - i*4), fps }) stagger
- ${motionSpringHints[creative.motionFeel]}
- Between scenes: add a visible transition (TransitionSeries or crossfade) — avoid naked jump cuts unless intentional glitch aesthetic.
- Root: <AbsoluteFill> wrapper required
- Named export: export const ComponentName: React.FC = () => { ... }${audio ? `\n- AUDIO: ${audio}` : ""}${imagesImportNeeded ? `\n- IMAGES: Use real Unsplash photo IDs sized for ${canvasW}×${canvasH}: <Img src="https://images.unsplash.com/photo-ID?w=${canvasW}&h=${canvasH}&fit=crop&q=80" style={{width:"100%",height:"100%",objectFit:"cover"}} />` : ""}
- ${determinism}`;

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
- Vary typography scale and motion so long videos don't feel like one static card.`;

  if (filePath && fileContent) {
    const lines = fileContent.split("\n");
    const trimmed = lines.length > 120 ? lines.slice(0, 120).join("\n") + "\n// ... (truncated)" : fileContent;
    return `${hfBlock}\n\n${rules}\n\n${strictFormat}\n\nCURRENT FILE (${filePath}):\n\`\`\`tsx\n${trimmed}\n\`\`\`\n\nTASK: ${userRequest}\n\n${runtimeCopyBlock}\n\nOutput the COMPLETE modified file in a single \`\`\`tsx block. No explanations.`;
  }

  return `${hfBlock}\n\n${rules}\n\n${strictFormat}\n\nTASK: ${userRequest}\n\nSPECS: ${secs}s = ${durationInFrames}fr @ ${fps}fps, canvas ${canvasW}×${canvasH} (${orient}) — match this composition size in all layout math.\n${runtimeCopyBlock}\nUse <Sequence> for multiple scenes with cinematic transitions aligned to the creative directive.\n\nOutput format (exactly this shape, nothing else):\n\`\`\`tsx\nimport { useCurrentFrame, ... } from "remotion";\nexport const YourComponentName: React.FC = () => { ... };\n\`\`\`\nFILE: remotion/compositions/YourComponentName.tsx`;
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

// ═══════════════════════════════════════════════════════════════════════════════
// Route
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  let body: {
    userMessage?: unknown;
    attachments?: unknown;
    aspect?: unknown;
    pace?: unknown;
    maxScenes?: unknown;
    useVision?: unknown;
    motionFeel?: unknown;
    captionTone?: unknown;
    transitionEnergy?: unknown;
    durationSeconds?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response(
      JSON.stringify({
        error:
          "Request body must be valid JSON with { userMessage, attachments?, aspect?, pace?, maxScenes?, useVision?, motionFeel?, captionTone?, transitionEnergy?, durationSeconds? }.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const userMessage =
    typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  if (!userMessage) {
    return new Response(
      JSON.stringify({ error: "userMessage is required and must be a non-empty string." }),
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
      ? Math.max(2, Math.min(10, Math.round(body.maxScenes)))
      : 6;
  const useVision = body.useVision !== false; // default on
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
          send({ type: "status", text: `Vision pass · reading ${analyses.length} images…` });
          visionNotes = await Promise.all(
            analyses.map(async (a) => {
              const note = await describeImage(a, creative.captionTone);
              // Stream back as we complete so the UI can show Gemma's read.
              send({ type: "vision_note", note });
              return note;
            })
          );
        }

        send({ type: "status", text: `Composing captions (${targetDurationSec}s target · ${pace} pace · ${aspect})…` });

        const prompt = buildReelPrompt(
          userMessage,
          attachments,
          visionNotes,
          aspect,
          pace,
          maxScenes,
          creative,
          targetDurationSec
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
        const validation = validateReelSpec(parsed, validPaths, copyLimits);
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

        const tsxSource = renderReelComponent(componentName, spec, sceneLen, transLen);
        send({ type: "status", text: `Writing ${outPath}…` });
        fs.mkdirSync(path.dirname(fullOut), { recursive: true });
        fs.writeFileSync(fullOut, tsxSource, "utf-8");
        send({ type: "file_written", path: outPath });

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

        send({
          type: "reel_spec",
          componentName,
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

      const audioFile = needsAudio(userMessage) ? pickAudio(userMessage) : null;
      const prompt = buildPrompt(userMessage, filePath, fileContent, durationInFrames, audioFile, creative, cw, ch);
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
