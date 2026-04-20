import { NextRequest, NextResponse } from "next/server";
import { getPreset, SLIDE_PRESETS } from "@/lib/slide-presets";
import { findBannedPhrases, sanitizeOneLine, sanitizeParagraph } from "@/lib/copy-guard";
import { safeModelJsonObject } from "@/lib/json-repair";

export const runtime = "nodejs";
export const maxDuration = 30;

const OLLAMA_BASE = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_URL = `${OLLAMA_BASE}/api/chat`;
const MODEL = process.env.OLLAMA_TEXT_MODEL ?? process.env.OLLAMA_MODEL ?? "gemma4:e4b";

const MODES = {
  shorter: "cut word count in half, keep the punch",
  longer: "expand with one concrete detail, keep under the char limit",
  punchier: "rewrite with more energy, aggressive verbs, short sentences",
  formal: "rewrite in a more formal, professional voice",
  casual: "rewrite in a warmer, conversational voice",
  poetic: "rewrite with more rhythm and imagery, still clear",
} as const;

type Mode = keyof typeof MODES;

async function rewriteCopy(prompt: string): Promise<{ title?: string; body?: string } | null> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json",
      options: { temperature: 0.75, top_p: 0.92, num_ctx: 2048, num_predict: 320 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const j = await res.json();
  const raw = (j?.message?.content ?? "") as string;
  return safeModelJsonObject(raw) as { title?: string; body?: string } | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title: string;
      bodyText?: string;
      mode: Mode;
      preset?: string;
    };

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const mode = body.mode in MODES ? body.mode : "punchier";
    const presetId = body.preset && SLIDE_PRESETS.some((p) => p.id === body.preset) ? body.preset : "editorial";
    const preset = getPreset(presetId);

    const instruction = MODES[mode];
    const prompt = `Rewrite this slide copy — ${instruction}.

Keep the meaning. Keep it social-ready (no quotes, no hashtags unless given, no cliches).

Constraints:
- title: <= ${preset.maxTitleChars} chars
- body: <= ${preset.maxBodyChars} chars

Return ONE JSON object exactly: { "title": string, "body": string }.

Current title: ${JSON.stringify(body.title)}
Current body:  ${JSON.stringify(body.bodyText ?? "")}`;

    let parsed = await rewriteCopy(prompt);

    const firstTitle = typeof parsed?.title === "string" ? sanitizeOneLine(parsed.title, preset.maxTitleChars) : "";
    const firstBody = typeof parsed?.body === "string" ? sanitizeParagraph(parsed.body, preset.maxBodyChars) : "";
    const banned = findBannedPhrases(`${firstTitle}\n${firstBody}`);
    if (!parsed || typeof parsed.title !== "string" || banned.length > 0) {
      parsed = await rewriteCopy(
        `${prompt}

Previous attempt had issues${banned.length ? ` (${banned.join(", ")})` : ""}.
Rewrite again with concrete language and no banned AI/marketing phrases.`
      );
    }

    if (!parsed || typeof parsed.title !== "string") {
      return NextResponse.json({ error: "bad model response" }, { status: 502 });
    }

    const title = sanitizeOneLine(parsed.title, preset.maxTitleChars);
    const bodyText = typeof parsed.body === "string" ? sanitizeParagraph(parsed.body, preset.maxBodyChars) : (body.bodyText ?? "");
    return NextResponse.json({
      title:
        preset.titleCase === "upper" ? title.toUpperCase()
        : preset.titleCase === "lower" ? title.toLowerCase()
        : title,
      body: bodyText,
      mode,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "failed" }, { status: 500 });
  }
}
