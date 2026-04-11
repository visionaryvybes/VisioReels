import { NextRequest, NextResponse } from "next/server";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "visio-gemma";
const OLLAMA_FALLBACK = process.env.OLLAMA_FALLBACK_MODEL || "gemma4:e4b";

interface GenerateRequest {
  image: string;
  platform: string;
  mood: string;
}

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string | OllamaContentPart[];
}

interface OllamaContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface VideoScript {
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

const PLATFORM_CONTEXT: Record<string, string> = {
  tiktok: "TikTok (9:16, 15 seconds, casual and viral, Gen Z tone, hook within first 3 frames)",
  reels: "Instagram Reels (9:16, 30 seconds, aesthetic and story-driven, aspirational tone)",
  shorts: "YouTube Shorts (9:16, 20 seconds, educational or entertaining, clear value prop)",
  pinterest: "Pinterest (2:3, 10 seconds, visually rich, keyword-driven, save-worthy)",
  x: "X/Twitter (16:9, 15 seconds, punchy commentary, opinionated, controversial hooks perform best)",
};

const MOOD_CONTEXT: Record<string, string> = {
  cinematic: "cinematic and epic — film-grade color, teal & orange LUT, slow drama",
  "dark-moody": "dark and moody — desaturated, atmospheric, brooding and powerful",
  vibrant: "vibrant and energetic — saturated colors, high energy, joyful and punchy",
  minimal: "minimal and refined — clean aesthetic, quiet luxury, editorial and calm",
  raw: "raw and authentic — no filter, genuine, relatable and unpolished",
  neon: "neon cyberpunk — electric colors, glow effects, futuristic and electric",
};

async function callOllama(
  model: string,
  messages: OllamaMessage[],
  image?: string
): Promise<string> {
  // Build messages for Ollama vision format
  const ollamaMessages = messages.map((msg) => {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }
    return msg;
  });

  // If we have an image, add it to the last user message using Ollama's images array format
  const body = image
    ? {
        model,
        messages: ollamaMessages.map((msg, idx) => {
          if (idx === ollamaMessages.length - 1 && msg.role === "user") {
            return {
              ...msg,
              images: [image.replace(/^data:image\/[a-z]+;base64,/, "")],
            };
          }
          return msg;
        }),
        stream: false,
        format: "json",
        options: { temperature: 0.85, top_p: 0.9, num_ctx: 8192 },
      }
    : {
        model,
        messages: ollamaMessages,
        stream: false,
        format: "json",
        options: { temperature: 0.85, top_p: 0.9, num_ctx: 8192 },
      };

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000), // 2 min timeout
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
    const { image, platform, mood } = body;

    if (!image || !platform || !mood) {
      return NextResponse.json(
        { error: "Missing required fields: image, platform, mood" },
        { status: 400 }
      );
    }

    const platformCtx = PLATFORM_CONTEXT[platform] ?? platform;
    const moodCtx = MOOD_CONTEXT[mood] ?? mood;

    const systemPrompt = `You are a viral social media video director in 2026. You create scripts optimized for ${platformCtx}.

CORE RULES:
- Always start with a 3-second hook that grabs attention immediately
- Write punchy, authentic copy that matches the platform tone
- The mood/vibe is: ${moodCtx}
- Word-by-word captions (1-3 words each) perform best — write captions this way
- No more than 5 hashtags — make them specific, not generic
- Series content: always hint at "more to come"

RETURN FORMAT: Valid JSON only. No markdown. No explanation. Start with { and end with }.
{
  "hook": "The opening 3-second hook text (punchy, max 8 words)",
  "script": "Full voiceover script (50-150 words, matches platform duration)",
  "captions": ["array", "of", "caption", "chunks", "1-3", "words", "each"],
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "style": {
    "transition": "transition style name",
    "textStyle": "text style description",
    "colorGrade": "color grading description"
  }
}`;

    const messages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this image and create a ${moodCtx} video script for ${platformCtx}.
The content should feel authentic, hook viewers in 3 seconds, and be optimized for maximum engagement.
Return the JSON response now.`,
      },
    ];

    let rawContent = "";
    let lastError: Error | null = null;

    // Try primary model first, then fallback
    for (const model of [OLLAMA_MODEL, OLLAMA_FALLBACK]) {
      try {
        rawContent = await callOllama(model, messages, image);
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
      // Clean up any markdown fences if model misbehaved
      const cleaned = rawContent
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned) as VideoScript;
    } catch {
      // If JSON parsing fails, return a structured fallback
      console.error("[generate] Failed to parse JSON from model:", rawContent.slice(0, 500));
      return NextResponse.json(
        {
          error: "Model returned invalid JSON. Try again.",
          raw: rawContent.slice(0, 500),
        },
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
