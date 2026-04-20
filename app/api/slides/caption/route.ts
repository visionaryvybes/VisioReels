import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const OLLAMA_BASE = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_URL = `${OLLAMA_BASE}/api/chat`;
const MODEL = process.env.OLLAMA_TEXT_MODEL ?? process.env.OLLAMA_MODEL ?? "gemma4:e4b";

// This endpoint rewrites ONLY the social caption + hashtags for an existing
// deck — no vision, no preset changes. It's what we hit when the user flips
// the platform after generation and wants IG-native or LinkedIn-native copy
// without re-running the whole pipeline.

type Platform = "instagram" | "tiktok" | "linkedin" | "x" | "pinterest" | "general";

const PLATFORM_GUIDE: Record<
  Platform,
  { label: string; voice: string; captionRules: string; hashtagCount: [number, number]; emoji: string; cta: string }
> = {
  instagram: {
    label: "Instagram carousel",
    voice: "scroll-stopping, visual, conversational.",
    captionRules:
      "2–4 short paragraphs. Open with a one-line hook. Line breaks — never walls of text. End with a single-line CTA, then 8–12 hashtags on a new line.",
    hashtagCount: [8, 12],
    emoji: "up to 2 tasteful emojis",
    cta: "save this, share with a friend, follow for more",
  },
  tiktok: {
    label: "TikTok / Reels",
    voice: "ultra-punchy, Gen-Z, rhythmic. Short lines. No filler.",
    captionRules: "One hook, one tension, one payoff. ≤ 220 chars total. 3–5 hashtags only.",
    hashtagCount: [3, 5],
    emoji: "one emoji max or zero",
    cta: "wait for it, pt 2?, save for later",
  },
  linkedin: {
    label: "LinkedIn document",
    voice: "insight-driven, professional but human. No corporate jargon.",
    captionRules:
      "4–6 short paragraphs. One-line hook. Line breaks every 1–2 sentences. End with a reflective question. 0–3 hashtags at the bottom.",
    hashtagCount: [0, 3],
    emoji: "no emojis",
    cta: "curious how you'd approach this, what would you add?",
  },
  x: {
    label: "X / Twitter",
    voice: "dry, precise, confident. Cut every unnecessary word.",
    captionRules: "One opener ≤ 240 chars, one follow-up line. 0–2 hashtags, usually none.",
    hashtagCount: [0, 2],
    emoji: "no emojis",
    cta: "reply with yours, bookmark",
  },
  pinterest: {
    label: "Pinterest pin",
    voice: "aspirational, keyword-rich, evocative.",
    captionRules:
      "One descriptive keyword-rich sentence, one inspirational line, 5–10 hashtags mixing broad and specific.",
    hashtagCount: [5, 10],
    emoji: "no emojis",
    cta: "save to your board",
  },
  general: {
    label: "General social",
    voice: "confident, concrete, on-brand.",
    captionRules: "2–4 short paragraphs, a one-line CTA, 5–10 hashtags.",
    hashtagCount: [5, 10],
    emoji: "use emojis sparingly",
    cta: "save this, share this",
  },
};

function validatePlatform(p: unknown): Platform {
  const v = typeof p === "string" ? p.toLowerCase() : "";
  if (v in PLATFORM_GUIDE) return v as Platform;
  return "instagram";
}

function extractJson(raw: string): unknown | null {
  try { return JSON.parse(raw); } catch { /* fallthrough */ }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch { return null; }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      platform?: string;
      tone?: string;
      topic?: string;
      brand?: string;
      slides: { title: string; body?: string; subject?: string; mood?: string; objects?: string[] }[];
    };

    if (!Array.isArray(body.slides) || body.slides.length === 0) {
      return NextResponse.json({ error: "slides required" }, { status: 400 });
    }

    const platform = validatePlatform(body.platform);
    const guide = PLATFORM_GUIDE[platform];
    const tone = (body.tone ?? "confident").trim();
    const topic = (body.topic ?? "").trim();
    const brand = (body.brand ?? "").trim();

    const manifest = body.slides
      .map((s, i) => {
        const subj = s.subject ? ` | subject="${s.subject}"` : "";
        const mood = s.mood ? ` | mood=${s.mood}` : "";
        const objs = Array.isArray(s.objects) && s.objects.length ? ` | objects=[${s.objects.join(", ")}]` : "";
        return `  ${i + 1}. title="${s.title}"${s.body ? ` | body="${s.body}"` : ""}${subj}${mood}${objs}`;
      })
      .join("\n");

    const [minTags, maxTags] = guide.hashtagCount;

    const prompt = `You are a senior social-media copywriter. Rewrite ONLY the caption + hashtags for a ${body.slides.length}-slide carousel heading to ${guide.label.toUpperCase()}. The slide copy itself is already finalised — do not touch titles or bodies, use them as the source of truth.

Respond with ONE JSON object. No prose, no markdown, no code fence.

SCHEMA:
{
  "hook":     string,           // one line, ≤ 90 chars — slide 1 opener translated into platform voice
  "caption":  string,           // full caption ready to paste, following the rules below
  "hashtags": string[],         // ${minTags}–${maxTags} hashtags, no "#" prefix
  "cta":      string            // one-line call-to-action
}

PLATFORM VOICE
${guide.voice}

CAPTION RULES
${guide.captionRules}

EMOJI POLICY
${guide.emoji}

CTA HINTS (pick or match the spirit)
${guide.cta}

TONE OVERRIDE
${tone.toUpperCase()}

BANNED (AI tropes)
"in today's fast-paced world", "revolutionary", "game-changing", "unlock", "elevate",
"here's the thing", "let's dive in", "buckle up", "the future of X is here".

BRIEF FROM THE CREATOR
${topic || "(no brief — use the slides themselves)"}

BRAND (optional)
${brand || "(none)"}

DECK
${manifest}

Return ONLY the JSON object now. Write like someone who actually posts on ${guide.label}.`;

    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        format: "json",
        options: {
          temperature: 0.8,
          top_p: 0.95,
          top_k: 50,
          repeat_penalty: 1.18,
          num_ctx: 4096,
          num_predict: 1400,
        },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const j = await res.json();
    const raw = (j?.message?.content ?? "") as string;
    const parsed = extractJson(raw) as {
      hook?: string;
      caption?: string;
      hashtags?: string[];
      cta?: string;
    } | null;

    if (!parsed || typeof parsed.caption !== "string") {
      return NextResponse.json({ error: "bad model response" }, { status: 502 });
    }

    const rawTags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .filter((x): x is string => typeof x === "string")
          .map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, "").toLowerCase())
          .filter((t) => t.length >= 2 && t.length <= 40 && /^[a-z0-9_]+$/.test(t))
      : [];
    const hashtags = Array.from(new Set(rawTags)).slice(0, guide.hashtagCount[1]);

    return NextResponse.json({
      platform,
      hook: typeof parsed.hook === "string" ? parsed.hook.trim().slice(0, 90) : "",
      caption: parsed.caption.trim().slice(0, 2200),
      hashtags,
      cta: typeof parsed.cta === "string" ? parsed.cta.trim().slice(0, 80) : guide.cta.split(",")[0].trim(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "failed" }, { status: 500 });
  }
}
