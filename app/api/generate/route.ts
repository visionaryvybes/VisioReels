import { NextRequest, NextResponse } from "next/server";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "visio-gemma";
const OLLAMA_FALLBACK = process.env.OLLAMA_FALLBACK_MODEL || "gemma4:e4b";

interface GenerateRequest {
  image?: string;    // backward compat: single image
  images?: string[]; // multi-image: array (max 5)
  platform: string;
  mood: string;
}

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

interface VideoScript {
  hook: string;
  script: string;
  captions: string[];
  hashtags: string[];
  cta?: string;
  style: {
    transition: string;
    textStyle: string;
    colorGrade: string;
  };
}

const PLATFORM_CONTEXT: Record<string, string> = {
  tiktok: "TikTok (9:16, 15 seconds, casual and viral, Gen Z tone, hook within first 3 frames)",
  reels: "Instagram Reels (9:16, 30 seconds, aesthetic and story-driven, aspirational tone)",
  shorts: "YouTube Shorts (9:16, 20 seconds, educational or entertaining, clear value prop)",
  pinterest: "Pinterest (2:3, 10 seconds, visually rich, keyword-driven, save-worthy)",
  x: "X/Twitter (16:9, 15 seconds, punchy commentary, opinionated, controversial hooks perform best)",
};

const MOOD_CONTEXT: Record<string, string> = {
  cinematic: "cinematic and epic — film-grade color, teal & orange LUT, slow drama, Ken Burns movement",
  "dark-moody": "dark and moody — desaturated, atmospheric, brooding with glitch effects",
  vibrant: "vibrant and energetic — saturated colors, high energy, speed lines and zoom burst",
  minimal: "minimal and refined — clean aesthetic, quiet luxury, editorial and calm",
  raw: "raw and authentic — no filter, genuine, relatable and unpolished, film grain",
  neon: "neon cyberpunk — electric colors, RGB split, glow effects, futuristic",
};

async function callOllama(
  model: string,
  messages: OllamaMessage[],
): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: "json",
      options: { temperature: 0.85, top_p: 0.9, num_ctx: 8192 },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`Ollama ${model} returned ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { message?: { content?: string }; error?: string };
  if (data.error) throw new Error(data.error);
  return data.message?.content ?? "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Partial<GenerateRequest>;
    const { platform, mood } = body;

    // Normalize images: support both single `image` and `images[]`
    const allImages: string[] = body.images?.length
      ? body.images.slice(0, 5)
      : body.image
        ? [body.image]
        : [];

    if (allImages.length === 0 || !platform || !mood) {
      return NextResponse.json(
        { error: "Missing required fields: image(s), platform, mood" },
        { status: 400 }
      );
    }

    const platformCtx = PLATFORM_CONTEXT[platform] ?? platform;
    const moodCtx = MOOD_CONTEXT[mood] ?? mood;
    const isMultiImage = allImages.length > 1;

    const multiImageNote = isMultiImage
      ? `\n\nIMPORTANT — MULTI-CUT VIDEO: The user has provided ${allImages.length} images for a multi-cut sequence. Structure the script as ${allImages.length} distinct scenes, one per image. Use emotional transitions between scenes ("But then...", "The real secret:", "And finally:"). The captions should flow across all scenes naturally.`
      : "";

    const systemPrompt = `You are a viral social media video director in 2026. You create scripts optimized for ${platformCtx}.

CORE RULES:
- Always start with a hook that grabs attention in 0.8 seconds
- Write punchy, authentic copy that matches the platform tone
- The mood/vibe is: ${moodCtx}
- Word-by-word captions (1-3 words each) perform best — write captions this way
- Minimum 10 caption elements, each 1-3 words max
- No more than 5 hashtags — make them specific, not generic
- CTA must drive saves or comments (not likes)
${multiImageNote}

RETURN FORMAT: Valid JSON only. No markdown. No explanation. Start with { and end with }.
{
  "hook": "Opening 0.8-second hook text (max 8 words, punchy)",
  "script": "Full voiceover script (50-150 words, matches platform duration)",
  "captions": ["array", "of", "caption", "chunks", "1-3 words each", "min 10 items"],
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "cta": "End call to action — drives saves, comments, or follows (max 8 words)",
  "style": {
    "transition": "cut | cross-dissolve | flash | speed-ramp | fade",
    "textStyle": "bold-white | neon-glow | minimal-clean | handwritten | cinematic-gold",
    "colorGrade": "teal-orange | desaturated-blue | vibrant-pop | natural | neon-purple | minimal-fade"
  }
}`;

    // Use first image for vision — Gemma 4 processes one image at a time
    const primaryImageB64 = allImages[0].replace(/^data:image\/[a-z]+;base64,/, "");

    const userContent = isMultiImage
      ? `Analyze this image (scene 1 of ${allImages.length}) and create a ${moodCtx} multi-cut video script for ${platformCtx}. This is the first of ${allImages.length} sequential images. Structure the script to flow across all ${allImages.length} scenes, with this image setting the opening hook. Return the JSON now.`
      : `Analyze this image and create a ${moodCtx} video script for ${platformCtx}. Return the JSON now.`;

    const messages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userContent,
        images: [primaryImageB64],
      },
    ];

    let rawContent = "";
    let lastError: Error | null = null;

    // Try primary model first, then fallback
    for (const model of [OLLAMA_MODEL, OLLAMA_FALLBACK]) {
      try {
        rawContent = await callOllama(model, messages);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[generate] Model ${model} failed:`, lastError.message);
      }
    }

    if (!rawContent && lastError) {
      return NextResponse.json(
        { error: `AI generation failed: ${lastError.message}` },
        { status: 502 }
      );
    }

    // Parse the JSON response
    let parsed: VideoScript;
    try {
      const cleaned = rawContent
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned) as VideoScript;
    } catch {
      console.error("[generate] Failed to parse JSON from model:", rawContent.slice(0, 500));
      return NextResponse.json(
        { error: "Model returned invalid JSON. Try again.", raw: rawContent.slice(0, 500) },
        { status: 422 }
      );
    }

    // Validate required fields
    if (!parsed.hook || !parsed.script || !Array.isArray(parsed.captions)) {
      return NextResponse.json(
        { error: "Incomplete response from model. Missing required fields." },
        { status: 422 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
