import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { SLIDE_PRESETS, getPreset } from "@/lib/slide-presets";
import { pickPreset } from "@/lib/preset-auto";
import { buildHyperframesSlidesStagingBlock } from "@/lib/hyperframes-prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

const PROJECT_DIR = process.cwd();
const OLLAMA_BASE = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_URL = `${OLLAMA_BASE}/api/chat`;
const MODEL = process.env.OLLAMA_MODEL ?? "gemma4-coder";
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL ?? "gemma4:e4b";

// ─────────────────────────────────────────────────────────────────────────────
// Image analysis — dominant colour + brightness via sharp, plus a small base64
// rendition of the image so a vision-capable Gemma can actually SEE the subject.
// ─────────────────────────────────────────────────────────────────────────────

interface ImageAnalysis {
  path: string;
  name: string;
  width: number;
  height: number;
  dominant: string;      // hex
  brightness: number;    // 0..1
  contrastInk: "#000" | "#fff";
  palette: string[];     // 3 complementary hexes derived from dominant
  base64: string;        // resized JPEG for the vision model (no prefix)
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / (max - min) + (g < b ? 6 : 0); break;
      case g: h = (b - r) / (max - min) + 2; break;
      case b: h = (r - g) / (max - min) + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
    return Math.round(255 * c);
  };
  return rgbToHex(f(0), f(8), f(4));
}

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return 0.5;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function derivePalette(hex: string): string[] {
  const [h, s, l] = hexToHsl(hex);
  return [
    hslToHex((h + 30) % 360, Math.min(1, s + 0.1), Math.min(0.65, l + 0.1)),
    hslToHex((h + 180) % 360, Math.min(1, s * 0.9), Math.max(0.35, l * 0.85)),
    hslToHex((h + 210) % 360, s, Math.max(0.2, l * 0.5)),
  ];
}

async function analyzeImage(relPath: string, name: string): Promise<ImageAnalysis | null> {
  const full = path.join(PROJECT_DIR, "public", relPath);
  if (!fs.existsSync(full)) return null;
  try {
    const img = sharp(full);
    const meta = await img.metadata();
    const { dominant } = await img.stats();
    const hex = rgbToHex(dominant.r, dominant.g, dominant.b);
    const brightness = (0.299 * dominant.r + 0.587 * dominant.g + 0.114 * dominant.b) / 255;

    // Keep base64 small — 384 on longest edge, JPEG q=60 ≈ 18-30KB per image.
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
      contrastInk: brightness > 0.55 ? "#000" : "#fff",
      palette: derivePalette(hex),
      base64: buf.toString("base64"),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama — multimodal chat. Each image gets sent in its own message so the
// model can caption them individually, then we ask for the consolidated JSON.
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

async function callOllamaChat(messages: ChatMessage[], jsonMode: boolean, heavy = false): Promise<string> {
  const payload = {
    model: MODEL,
    messages,
    stream: false,
    ...(jsonMode ? { format: "json" } : {}),
    options: {
      // Composer pass (heavy=true) uses a slightly warmer, wider beam for more
      // creative / on-voice social copy.  Vision captioning stays tight.
      temperature: heavy ? 0.78 : 0.4,
      top_p: heavy ? 0.95 : 0.88,
      top_k: 50,
      repeat_penalty: 1.18,
      num_ctx: 8192,
      num_predict: heavy ? 2400 : 900,
    },
  };

  const call = (model: string) =>
    fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, model }),
    });

  let res = await call(MODEL);
  if (res.status === 404 && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
    res = await call(FALLBACK_MODEL);
  }
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const json = await res.json();
  const raw = (json?.message?.content ?? "") as string;
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 — describe each image with vision (short, concrete, no fluff)
// Stage 2 — compose the carousel JSON using those descriptions + the brief
// ─────────────────────────────────────────────────────────────────────────────

interface VisionNote {
  path: string;
  subject: string;  // what the image actually shows
  mood: string;     // "serene", "dramatic", "eerie" …
  objects: string[]; // 3-6 nouns the model detected
}

async function describeImagesBatch(analyses: ImageAnalysis[]): Promise<VisionNote[]> {
  const n = analyses.length;
  const prompt = `You are a visual analyst. Look at these ${n} photos IN ORDER and return ONE JSON object.

Return: {"notes": [array of ${n} objects, one per photo in order]}
Each object: {"subject": "one sentence — what is the main subject", "mood": "1-2 words", "objects": ["3-6 concrete nouns visible"]}
Return ONLY the JSON.`;

  try {
    const raw = await callOllamaChat(
      [{ role: "user", content: prompt, images: analyses.map((a) => a.base64) }],
      true
    );
    const parsed = extractJson(raw) as Record<string, unknown> | null;
    const notes = Array.isArray(parsed?.notes) ? (parsed!.notes as Record<string, unknown>[]) : null;
    return analyses.map((a, i) => {
      const p = notes?.[i] as Partial<VisionNote> | null;
      return {
        path: a.path,
        subject: typeof p?.subject === "string" ? p.subject.trim().slice(0, 180) : "",
        mood: typeof p?.mood === "string" ? p.mood.trim().slice(0, 20) : "",
        objects: Array.isArray(p?.objects)
          ? (p!.objects as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 6).map((x) => x.slice(0, 40))
          : [],
      };
    });
  } catch {
    return analyses.map((a) => ({ path: a.path, subject: "", mood: "", objects: [] }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: composer prompt with actual visual context baked in
// ─────────────────────────────────────────────────────────────────────────────

interface SlidePayload {
  title: string;
  body: string;
  kicker?: string;
  accent?: string;
  textAlign?: "start" | "center" | "end";
}

type Platform = "instagram" | "tiktok" | "linkedin" | "x" | "pinterest" | "general";

interface PlatformGuide {
  label: string;
  voice: string;
  hookRules: string;
  captionRules: string;
  hashtagCount: [number, number];
  emojiPolicy: string;
  ctaHints: string;
}

const PLATFORM_GUIDE: Record<Platform, PlatformGuide> = {
  instagram: {
    label: "Instagram carousel",
    voice:
      "scroll-stopping, visual, conversational. Hook slide has to make a thumb stop mid-feed.",
    hookRules:
      "First slide is the hook — a bold, specific claim or a question that opens a loop. No generic openers like 'in today's world'. Avoid cliches.",
    captionRules:
      "Caption: 2–4 short paragraphs (each ≤ 2 lines). Open with a 1-line hook that mirrors slide 1 but isn't identical. Use line breaks — never walls of text. Finish with a single-line CTA and 8–12 hashtags on a new line.",
    hashtagCount: [8, 12],
    emojiPolicy:
      "Up to 2 tasteful emojis in the caption (never in slide titles unless the preset is playful). No hashtag spam.",
    ctaHints: "save this, share with a friend, double tap if …, follow for more.",
  },
  tiktok: {
    label: "TikTok / Reels",
    voice:
      "ultra-punchy, Gen-Z, rhythmic. Short lines, strong verbs, no filler. Sentences of 3–6 words.",
    hookRules:
      "Hook is 3–7 words max — a pattern break, surprise, or 'POV'. Think: 'POV: you just …', 'nobody talks about …', 'this changed everything'.",
    captionRules:
      "Caption: one hook line, one tension line, one payoff. ≤ 220 chars total. 3–5 hashtags only.",
    hashtagCount: [3, 5],
    emojiPolicy: "One emoji max, only if it fits the tone. Usually zero.",
    ctaHints: "wait for it, pt 2?, save for later, tag someone.",
  },
  linkedin: {
    label: "LinkedIn document post",
    voice:
      "insight-driven, professional but human. No corporate jargon, no 'thrilled to announce'. Specific numbers and lived-in experience.",
    hookRules:
      "Hook is a contrarian claim, a data point, or a specific moment. Avoid 'in today's fast-paced world'. Avoid empty adjectives (revolutionary, game-changing).",
    captionRules:
      "Caption: 4–6 short paragraphs. Open with a one-line hook, then a line break. Use line breaks every 1–2 sentences. End with a reflective question. 0–3 hashtags max, placed at the bottom.",
    hashtagCount: [0, 3],
    emojiPolicy: "No emojis unless the preset is explicitly playful.",
    ctaHints: "what's been your experience?, curious how others handle this.",
  },
  x: {
    label: "X / Twitter thread cover",
    voice: "dry, precise, confident. Cut every unnecessary word.",
    hookRules:
      "Hook ≤ 90 characters. A claim you'd want to debate. Avoid thread-bro tropes ('Here are 7 ways …').",
    captionRules:
      "Caption: one punchy opener ≤ 240 chars, then one follow-up line. 0–2 hashtags, usually none.",
    hashtagCount: [0, 2],
    emojiPolicy: "No emojis.",
    ctaHints: "reply with yours, quote with a take, bookmark.",
  },
  pinterest: {
    label: "Pinterest pin",
    voice:
      "aspirational, keyword-rich, evocative. Skews toward how-to, aesthetics, inspiration.",
    hookRules:
      "Hook uses searchable keywords — 'modernist cabin interiors', 'earthy bedroom ideas', not vague poetry.",
    captionRules:
      "Caption: one descriptive keyword-rich sentence, one inspirational line, 5–10 hashtags mixing broad and specific.",
    hashtagCount: [5, 10],
    emojiPolicy: "No emojis.",
    ctaHints: "save to your board, get the look.",
  },
  general: {
    label: "General social",
    voice: "confident, concrete, on-brand.",
    hookRules: "Avoid generic AI openers. Be specific about what's in the photos.",
    captionRules:
      "Caption: 2–4 short paragraphs, a one-line CTA, 5–10 hashtags.",
    hashtagCount: [5, 10],
    emojiPolicy: "Use emojis sparingly.",
    ctaHints: "save this, share this, follow for more.",
  },
};

function validatePlatform(p: unknown): Platform {
  const v = typeof p === "string" ? p.toLowerCase() : "";
  if (v in PLATFORM_GUIDE) return v as Platform;
  return "instagram";
}

interface SlidesResponse {
  topic: string;
  hook: string;
  slides: SlidePayload[];
  caption: string;
  hashtags: string[];
  cta: string;
  platform: Platform;
}

function buildComposerPrompt(
  topic: string,
  tone: string,
  presetId: string,
  platform: Platform,
  analyses: ImageAnalysis[],
  notes: VisionNote[],
  brand?: string
): string {
  const preset = getPreset(presetId);
  const guide = PLATFORM_GUIDE[platform];

  const manifest = analyses
    .map((a, i) => {
      const n = notes[i] ?? { subject: "", mood: "", objects: [] };
      return `  ${i + 1}. subject="${n.subject || "unknown scene"}"
     mood=${n.mood || "n/a"}
     objects=[${n.objects.join(", ")}]
     dominant=${a.dominant}  brightness=${a.brightness.toFixed(2)}  palette=[${a.palette.join(", ")}]`;
    })
    .join("\n");

  const [minTags, maxTags] = guide.hashtagCount;

  return `You are a senior social-media copywriter composing a ${analyses.length}-slide carousel for ${guide.label.toUpperCase()}.
Your job: write copy that, if pasted verbatim to the platform today, would ACE the platform's native lingo — no AI-sounding filler, no corporate tropes, no "in today's fast-paced world".

You WILL see an IMAGE MANIFEST below with per-image subject descriptions from a vision model. Every line you write must be grounded in those specific photos. If it could apply to any photoshoot, rewrite it.

Respond with ONE JSON object. No prose, no markdown, no code fence.

SCHEMA:
{
  "topic":    string,                  // 2-6 word unifying theme, phrased like a search query
  "hook":     string,                  // the headline text of slide 1 (≤ ${preset.maxTitleChars} chars)
  "slides":   [{
    "title":     string,               // headline for this slide (≤ ${preset.maxTitleChars} chars)
    "body":      string,               // supporting copy (≤ ${preset.maxBodyChars} chars, may be empty)
    "kicker":    string,               // tiny overline (≤ 16 chars, often "01 / 05")
    "accent":    string,               // 6-digit hex that CONTRASTS the image dominant colour
    "textAlign": "start" | "center" | "end"
  }],
  "caption":  string,                  // the FULL post caption ready to paste (see CAPTION RULES)
  "hashtags": string[],                // ${minTags}–${maxTags} platform-native hashtags, no "#" prefix (we add it)
  "cta":      string                   // one-line call-to-action matching the platform voice
}

PLATFORM VOICE (${guide.label})
${guide.voice}

HOOK RULES
${guide.hookRules}

CAPTION RULES
${guide.captionRules}

EMOJI POLICY
${guide.emojiPolicy}

CTA HINTS (pick one or write in the same spirit)
${guide.ctaHints}

${buildHyperframesSlidesStagingBlock()}

HASHTAG RULES
- Mix ${minTags}–${maxTags} tags: some broad (reach) + some specific (the actual subject from the manifest).
- Lowercase, no spaces, no generic spam like #love #photo #instagood.
- They should read like they were picked by a human who actually uses this platform.

SLIDE RULES
- slides.length === ${analyses.length} (one per image, SAME order as the manifest).
- Every title must directly reference what is IN that image (subject, object, or mood from the manifest).
- Vary titles — no two slides share the same noun or verb.
- Slide 1 = the HOOK (scroll-stopper).
- Last slide = the PAYOFF (clear CTA or resonant closer).
- Middle slides build tension, deliver value, or pace the story — they are NOT generic filler.
- ${preset.titleCase === "upper" ? "TITLES MUST BE UPPERCASE." : preset.titleCase === "lower" ? "titles must be lowercase." : "Titles use natural case."}
- Tone override from user: ${tone.toUpperCase() || "CONFIDENT"} — blend this into the platform voice.
- Preset aesthetic: ${preset.label} — ${preset.blurb} (affects pacing and word choice).

BANNED PHRASES (never use these, they scream AI):
- "in today's fast-paced world"
- "revolutionary", "game-changing", "unlock", "elevate", "curated"
- "here's the thing", "let's dive in", "buckle up"
- "the future of X is here"
- any sentence starting with "imagine if"
- empty adjective pileups ("bold, vibrant, stunning")

BRIEF FROM THE CREATOR
${topic.trim() || "(no user brief — the photos themselves ARE the brief; find the through-line)"}

BRAND (mention only if it fits; DO NOT stamp every slide)
${brand?.trim() ? brand.trim() : "(none)"}

IMAGE MANIFEST
${manifest}

Now return ONLY the JSON object. Write like someone who actually posts on ${guide.label} — not like a bot describing what a post looks like.`;
}

function extractJson(raw: string): unknown | null {
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch { return null; }
  }
  return null;
}

function validateHex(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t) ? t : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic fallback — uses vision notes if we got any, otherwise colour stats.
// ─────────────────────────────────────────────────────────────────────────────

function fallbackSlides(
  topic: string,
  analyses: ImageAnalysis[],
  notes: VisionNote[],
  platform: Platform
): SlidesResponse {
  const cleanTopic = topic.trim() || (notes[0]?.subject?.split(" ").slice(0, 4).join(" ") || "A quiet moment");
  const guide = PLATFORM_GUIDE[platform];
  const outroByPlatform: Record<Platform, string[]> = {
    instagram: ["Save this.", "Share with someone.", "Follow for more.", "Swipe again."],
    tiktok: ["wait for it.", "pt 2?", "save for later.", "tag a friend."],
    linkedin: ["Curious how you'd approach this.", "What would you add?", "Reply with yours.", "Worth a conversation."],
    x: ["Bookmark.", "Reply with yours.", "Take.", "Your move."],
    pinterest: ["Save to your board.", "Get the look.", "Pin it.", "More like this →"],
    general: ["Save this.", "Share this.", "Follow for more.", "Keep going."],
  };
  const outro = outroByPlatform[platform];

  const slides: SlidePayload[] = analyses.map((a, i) => {
    const isFirst = i === 0;
    const isLast = i === analyses.length - 1;
    const n = notes[i];
    const subjectWords = (n?.subject ?? "").split(" ").slice(0, 5).join(" ");
    const firstNoun = n?.objects?.[0] ?? "";

    const title = isFirst
      ? cleanTopic
      : isLast
      ? outro[i % outro.length]
      : subjectWords || firstNoun || `Frame ${i + 1}`;

    return {
      title,
      body: isFirst && notes[0]?.mood ? `A ${notes[0].mood.toLowerCase()} ${analyses.length}-part study.` : "",
      kicker: `${String(i + 1).padStart(2, "0")} / ${String(analyses.length).padStart(2, "0")}`,
      accent: a.palette[0],
      textAlign: "start",
    };
  });

  // Derive a simple caption + hashtags from the manifest for the fallback path
  const subjectWords = new Set<string>();
  notes.forEach((n) => (n.subject || "").toLowerCase().split(/[\s,.]+/).forEach((w) => w.length > 4 && subjectWords.add(w)));
  notes.forEach((n) => n.objects.forEach((o) => subjectWords.add(o.toLowerCase().replace(/\s+/g, ""))));
  const tagPool = Array.from(subjectWords).slice(0, guide.hashtagCount[1]);
  const hookLine = notes[0]?.subject ? notes[0].subject.replace(/\.$/, "") : cleanTopic;
  const caption = [hookLine, "", notes.slice(1, 3).map((n) => n.subject).filter(Boolean).join(" "), "", outro[0]]
    .filter(Boolean)
    .join("\n");

  return {
    topic: cleanTopic,
    hook: slides[0].title,
    slides,
    caption,
    hashtags: tagPool,
    cta: outro[0],
    platform,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      topic?: string;
      tone?: string;
      preset?: string;
      autoPreset?: boolean;
      platform?: string;
      brand?: string;
      images: { path: string; name: string }[];
    };

    const images = (body.images ?? []).filter(
      (a) => typeof a?.path === "string" && /^uploads\/[A-Za-z0-9._-]+$/.test(a.path)
    );
    if (!images.length) {
      return NextResponse.json({ error: "no images" }, { status: 400 });
    }
    if (images.length > 10) {
      return NextResponse.json({ error: "max 10 slides per carousel" }, { status: 400 });
    }

    const analyses: ImageAnalysis[] = [];
    for (const img of images) {
      const a = await analyzeImage(img.path, img.name);
      if (a) analyses.push(a);
    }
    if (!analyses.length) {
      return NextResponse.json({ error: "could not read any of the images" }, { status: 400 });
    }

    const presetId = body.preset && SLIDE_PRESETS.some((p) => p.id === body.preset) ? body.preset : "editorial";
    const platform = validatePlatform(body.platform);
    const brand = typeof body.brand === "string" ? body.brand.slice(0, 60) : "";

    const topic = (body.topic ?? "").trim();
    const tone = (body.tone ?? "confident").trim();

    // Stage 1 — vision descriptions (batched: all images in one Gemma call)
    const notes: VisionNote[] = await describeImagesBatch(analyses);

    // Stage 1.5 — auto-preset suggestion based on vision notes + colour stats
    const auto = pickPreset({
      dominants: analyses.map((a) => a.dominant),
      brightnesses: analyses.map((a) => a.brightness),
      subjects: notes.map((n) => n.subject),
      moods: notes.map((n) => n.mood),
      objects: notes.flatMap((n) => n.objects),
    });

    // If the client opted in to autoPreset, let the auto-pick override the
    // preset for stage 2 so the copy constraints match the style we'll render.
    const effectivePresetId = body.autoPreset ? auto.preset.id : presetId;
    const effectivePreset = getPreset(effectivePresetId);

    // Stage 2 — compose carousel (heavy=true → warmer temperature + bigger num_predict)
    let slidesSpec: SlidesResponse;
    try {
      const raw = await callOllamaChat(
        [{ role: "user", content: buildComposerPrompt(topic, tone, effectivePresetId, platform, analyses, notes, brand) }],
        true,
        true
      );
      const parsed = extractJson(raw) as Partial<SlidesResponse> | null;
      if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
        throw new Error("empty response");
      }
      const normalised: SlidePayload[] = analyses.map((a, i) => {
        const s = (parsed.slides?.[i] ?? {}) as Partial<SlidePayload>;
        const title = typeof s.title === "string" && s.title.trim()
          ? s.title.trim().slice(0, effectivePreset.maxTitleChars)
          : notes[i]?.subject?.slice(0, effectivePreset.maxTitleChars) || topic || `Slide ${i + 1}`;
        const bodyText = typeof s.body === "string" ? s.body.trim().slice(0, effectivePreset.maxBodyChars) : "";
        const kicker = typeof s.kicker === "string" && s.kicker.trim()
          ? s.kicker.trim().slice(0, 16)
          : `${String(i + 1).padStart(2, "0")} / ${String(analyses.length).padStart(2, "0")}`;
        // Pick accent: prefer Gemma's choice, then find the darkest readable palette color.
        // Avoid very light colors (luminance > 0.72) that vanish on cream/white images.
        const rawAccent = validateHex(s.accent);
        const accent = rawAccent
          ?? a.palette.find((h) => hexLuminance(h) <= 0.72)
          ?? a.palette[1]
          ?? a.palette[0];
        const align: SlidePayload["textAlign"] =
          s.textAlign === "center" || s.textAlign === "end" ? s.textAlign : "start";
        return {
          title:
            effectivePreset.titleCase === "upper"
              ? title.toUpperCase()
              : effectivePreset.titleCase === "lower"
              ? title.toLowerCase()
              : title,
          body: bodyText,
          kicker,
          accent,
          textAlign: align,
        };
      });

      const [minTags, maxTags] = PLATFORM_GUIDE[platform].hashtagCount;
      const rawTags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags
            .filter((x): x is string => typeof x === "string")
            .map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, "").toLowerCase())
            .filter((t) => t.length >= 2 && t.length <= 40 && /^[a-z0-9_]+$/.test(t))
        : [];
      const dedupedTags = Array.from(new Set(rawTags)).slice(0, maxTags);
      const hashtags =
        dedupedTags.length >= minTags
          ? dedupedTags
          : dedupedTags; // don't inflate with junk — client can add more

      const cleanCaption = typeof parsed.caption === "string" ? parsed.caption.trim().slice(0, 2200) : "";
      const cleanCta =
        typeof parsed.cta === "string" && parsed.cta.trim()
          ? parsed.cta.trim().slice(0, 80)
          : PLATFORM_GUIDE[platform].ctaHints.split(",")[0].trim();

      slidesSpec = {
        topic:
          typeof parsed.topic === "string" && parsed.topic.trim()
            ? parsed.topic.trim().slice(0, 48)
            : topic || notes[0]?.subject?.split(" ").slice(0, 4).join(" ") || "Untitled",
        hook:
          typeof parsed.hook === "string" && parsed.hook.trim()
            ? parsed.hook.trim().slice(0, 60)
            : normalised[0].title,
        slides: normalised,
        caption: cleanCaption || normalised.map((s) => s.title).join("\n\n"),
        hashtags,
        cta: cleanCta,
        platform,
      };
    } catch {
      slidesSpec = fallbackSlides(topic, analyses, notes, platform);
    }

    // Strip base64 from response — the client doesn't need it.
    const analysesPublic = analyses.map((a) => ({
      path: a.path,
      name: a.name,
      width: a.width,
      height: a.height,
      dominant: a.dominant,
      brightness: a.brightness,
      contrastInk: a.contrastInk,
      palette: a.palette,
    }));

    return NextResponse.json({
      presetId: effectivePresetId,
      requestedPresetId: presetId,
      autoPresetUsed: Boolean(body.autoPreset),
      suggestedPreset: {
        id: auto.preset.id,
        label: auto.preset.label,
        reason: auto.reason,
        score: Math.round(auto.score * 10) / 10,
        runners: auto.runners,
      },
      analyses: analysesPublic,
      notes,
      ...slidesSpec,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "generate failed" },
      { status: 500 }
    );
  }
}
