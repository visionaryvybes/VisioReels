import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getPreset, SLIDE_PRESETS } from "@/lib/slide-presets";
import { findBannedPhrases, sanitizeOneLine, sanitizeParagraph } from "@/lib/copy-guard";
import { safeModelJsonObject } from "@/lib/json-repair";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROJECT_DIR = process.cwd();
const OLLAMA_BASE = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_URL = `${OLLAMA_BASE}/api/chat`;
const MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e4b";

interface SlideIn {
  title?: string;
  body?: string;
  kicker?: string;
  accent?: string;
  textAlign?: "start" | "center" | "end";
}

async function readImageBase64(relPath: string): Promise<string | null> {
  const full = path.join(PROJECT_DIR, "public", relPath);
  if (!fs.existsSync(full)) return null;
  try {
    const buf = await sharp(full)
      .rotate()
      .resize(384, 384, { fit: "inside" })
      .jpeg({ quality: 60 })
      .toBuffer();
    return buf.toString("base64");
  } catch {
    return null;
  }
}

function validateHex(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t) ? t : undefined;
}

async function generateSlide(prompt: string, b64: string): Promise<SlideIn | null> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt, images: [b64] }],
      stream: false,
      format: "json",
      options: { temperature: 0.7, top_p: 0.95, num_ctx: 4096, num_predict: 500 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const json = await res.json();
  const raw = (json?.message?.content ?? "") as string;
  return safeModelJsonObject(raw) as SlideIn | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      imagePath: string;
      preset?: string;
      tone?: string;
      topic?: string;
      index?: number;
      total?: number;
      prevTitles?: string[];
      role?: "first" | "body" | "last";
    };

    if (!body.imagePath || !/^uploads\/[A-Za-z0-9._-]+$/.test(body.imagePath)) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }
    const b64 = await readImageBase64(body.imagePath);
    if (!b64) return NextResponse.json({ error: "could not read image" }, { status: 400 });

    const presetId = body.preset && SLIDE_PRESETS.some((p) => p.id === body.preset) ? body.preset : "editorial";
    const preset = getPreset(presetId);
    const prevTitles = (body.prevTitles ?? []).slice(0, 12);

    const roleHint =
      body.role === "first"
        ? "This is the FIRST slide — make it a scroll-stopping hook."
        : body.role === "last"
        ? "This is the LAST slide — make it a clear call-to-action (SAVE, SHARE, FOLLOW, KEEP GOING)."
        : "This is a middle slide — carry the story forward.";

    const prompt = `You are a social media art director. Generate ONE slide of copy for this image.

Look at the photo. Your slide copy must reference what you actually see.

${roleHint}

Respond with ONE JSON object:
{
  "title":     string  // <= ${preset.maxTitleChars} chars
  "body":      string  // <= ${preset.maxBodyChars} chars (can be empty)
  "kicker":    string  // short overline, <= 16 chars
  "accent":    string  // 6-digit hex that CONTRASTS the image
  "textAlign": "start" | "center" | "end"
}

Preset aesthetic: ${preset.label} — ${preset.blurb}.
${preset.titleCase === "upper" ? "TITLE MUST BE UPPERCASE." : preset.titleCase === "lower" ? "title must be lowercase." : ""}
Tone: ${(body.tone || "confident").toUpperCase()}.
${body.topic?.trim() ? `Brief: ${body.topic.trim()}` : ""}
${prevTitles.length ? `AVOID these titles already used: ${prevTitles.map((t) => `"${t}"`).join(", ")}` : ""}

Return ONLY the JSON.`;

    let parsed = await generateSlide(prompt, b64);
    const banned = findBannedPhrases(
      `${sanitizeOneLine(parsed?.title ?? "", preset.maxTitleChars)}\n${sanitizeParagraph(parsed?.body ?? "", preset.maxBodyChars)}`
    );
    if (!parsed || typeof parsed.title !== "string" || banned.length > 0) {
      parsed = await generateSlide(
        `${prompt}

Previous attempt was weak${banned.length ? ` and used banned phrases (${banned.join(", ")})` : ""}.
Regenerate with sharper, image-grounded language and no AI cliches.`,
        b64
      );
    }

    if (!parsed || typeof parsed.title !== "string") {
      return NextResponse.json({ error: "bad response" }, { status: 502 });
    }

    const title = sanitizeOneLine(parsed.title, preset.maxTitleChars);
    const out = {
      title:
        preset.titleCase === "upper"
          ? title.toUpperCase()
          : preset.titleCase === "lower"
          ? title.toLowerCase()
          : title,
      body: typeof parsed.body === "string" ? sanitizeParagraph(parsed.body, preset.maxBodyChars) : "",
      kicker:
        typeof parsed.kicker === "string" && parsed.kicker.trim()
          ? sanitizeOneLine(parsed.kicker, 16)
          : `${String((body.index ?? 0) + 1).padStart(2, "0")} / ${String(body.total ?? 1).padStart(2, "0")}`,
      accent: validateHex(parsed.accent) ?? preset.accent,
      textAlign:
        parsed.textAlign === "center" || parsed.textAlign === "end" ? parsed.textAlign : "start",
    };

    return NextResponse.json({ slide: out });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "failed" }, { status: 500 });
  }
}
