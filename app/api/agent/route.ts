import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PROJECT_DIR = process.cwd();
const BIN = path.join(PROJECT_DIR, "node_modules/.bin");
const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "gemma4-coder";

// ── File resolver ─────────────────────────────────────────────────────────────

function resolveFile(request: string): string | null {
  const r = request.toLowerCase();
  if (r.includes("logreveal") || r.includes("logo")) return "remotion/compositions/LogoReveal.tsx";
  if (r.includes("aivideo") || r.includes("ai video") || r.includes("ai and coding")) return "remotion/compositions/AIVideo.tsx";
  if (r.includes("socialreel") || r.includes("tiktok") || r.includes("reels") || r.includes("caption") || r.includes("hook")) return "remotion/compositions/SocialReel.tsx";
  if (r.includes("root") || r.includes("composition") || r.includes("register")) return "remotion/Root.tsx";
  // Explicit edit keywords with no file type → let Gemma create new
  return null;
}

// ── Media helpers ─────────────────────────────────────────────────────────────

function needsAudio(r: string): boolean {
  const l = r.toLowerCase();
  return l.includes("music") || l.includes("audio") || l.includes("sound") || l.includes("soundtrack") || l.includes("song");
}

function needsImages(r: string): boolean {
  const l = r.toLowerCase();
  return l.includes("image") || l.includes("photo") || l.includes("picture") || l.includes("visual") || l.includes("background");
}

function parseDuration(request: string): number {
  // Look for "X second" or "X-second" patterns
  const match = request.match(/(\d+)\s*[-\s]?second/i);
  if (match) return Math.min(Math.max(parseInt(match[1]), 3), 120) * 30; // clamp 3–120s, 30fps
  return 300; // default 10s
}

function pickAudioFile(request: string): string {
  const r = request.toLowerCase();
  if (r.includes("neon") || r.includes("cyber") || r.includes("futur")) return "audio/music-neon.wav";
  if (r.includes("dark") || r.includes("moody") || r.includes("dramatic")) return "audio/music-dark-moody.wav";
  if (r.includes("minimal") || r.includes("clean") || r.includes("calm")) return "audio/music-minimal.wav";
  if (r.includes("vibrant") || r.includes("energy") || r.includes("hype")) return "audio/music-vibrant.wav";
  if (r.includes("raw") || r.includes("authentic") || r.includes("real")) return "audio/music-raw.wav";
  return "audio/music-cinematic.wav"; // default
}

function listRemotionFiles(): string {
  const dir = path.join(PROJECT_DIR, "remotion");
  const lines: string[] = [];
  function walk(d: string, depth: number) {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      lines.push("  ".repeat(depth) + e.name + (e.isDirectory() ? "/" : ""));
      if (e.isDirectory()) walk(path.join(d, e.name), depth + 1);
    }
  }
  walk(dir, 0);
  return lines.join("\n");
}

// ── Tool runner ───────────────────────────────────────────────────────────────

function runCmd(cmd: string): string {
  const resolved = cmd.startsWith("remotion")
    ? `${BIN}/remotion ${cmd.slice(8)}`
    : cmd;
  try {
    return execSync(resolved, {
      cwd: PROJECT_DIR, timeout: 300_000, encoding: "utf-8", stdio: "pipe",
      env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` },
    }).slice(-1000);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return ((err.stdout ?? "") + (err.stderr ?? "") || err.message || "failed").slice(-1000);
  }
}

// ── Code extractor ────────────────────────────────────────────────────────────

function extractCode(response: string): string | null {
  const match = response.match(/```(?:tsx?|jsx?|typescript|javascript)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  userRequest: string,
  filePath: string | null,
  fileContent: string | null,
  durationInFrames: number,
  audioFile: string | null = null
): string {
  const hasAudio = needsAudio(userRequest);
  const hasImages = needsImages(userRequest);

  const remotionRules = `REMOTION RULES (mandatory):
- All animations: useCurrentFrame() + interpolate() or spring() — NEVER CSS transitions
- Import from "remotion": useCurrentFrame, useVideoConfig, interpolate, spring, Easing, AbsoluteFill, Sequence${hasAudio ? ", Audio, staticFile" : ""}${hasImages ? ", Img" : ""}
- Durations: const { fps } = useVideoConfig(); const DUR = N * fps
- Clamp: { extrapolateRight: "clamp" }
- Word-by-word: stagger with index * N frames delay
- Entry easing: Easing.bezier(0.16, 1, 0.3, 1)
- Always wrap in <AbsoluteFill>
- Export the component as a named export (e.g. export const MyComponent: React.FC = ...)${hasAudio ? `
- AUDIO: use <Audio src={staticFile("${audioFile ?? "audio/music-cinematic.wav"}")} volume={0.3} loop /> inside <AbsoluteFill>` : ""}${hasImages ? `
- IMAGES: use <Img src="https://picsum.photos/seed/TOPIC/1080/1920" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  Use unique seeds per slide (e.g. "dubai1", "dubai2"). Wrap images in a <Sequence> with 0 zIndex so text overlays on top.` : ""}`;

  if (filePath && fileContent) {
    return `You are a Remotion video coding expert. Modify the file below exactly as the user requests.

${remotionRules}

CURRENT FILE: ${filePath}
\`\`\`tsx
${fileContent}
\`\`\`

USER REQUEST: ${userRequest}

Output the COMPLETE modified file inside a single \`\`\`tsx code block. No explanations. No partial code. The full file only.`;
  }

  const fps = 30;
  const seconds = Math.round(durationInFrames / fps);

  return `You are a Remotion video coding expert. Create a NEW Remotion composition.

${remotionRules}

USER REQUEST: ${userRequest}

SPECS:
- Duration: ${seconds} seconds = ${durationInFrames} frames at ${fps}fps
- Resolution: 1080×1920 (vertical, portrait)
- Split into slides using <Sequence from={i * slideFrames} durationInFrames={slideFrames}>
- Each slide: background color or image + animated text
- Dark overlay over images so text is readable

Project structure:
${listRemotionFiles()}

Output a NEW complete TSX file inside a \`\`\`tsx code block.
Then on a new line write: FILE: remotion/compositions/YourComponentName.tsx
No explanations outside the code block.`;
}

// ── Ollama streaming ──────────────────────────────────────────────────────────

async function streamOllama(
  prompt: string,
  onToken: (t: string) => void
): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      options: { temperature: 0.15, top_p: 0.9, num_ctx: 32768 },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama error: ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const tok = JSON.parse(line)?.message?.content ?? "";
        if (tok) { full += tok; onToken(tok); }
      } catch {}
    }
  }
  return full;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userMessage } = await req.json();

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (ev: Record<string, unknown>) =>
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

      // 1. Figure out which file to edit (or create new)
      const filePath = resolveFile(userMessage);
      let fileContent: string | null = null;
      const durationInFrames = filePath ? 300 : parseDuration(userMessage);

      if (filePath) {
        const full = path.join(PROJECT_DIR, filePath);
        try {
          fileContent = fs.readFileSync(full, "utf-8");
          send({ type: "status", text: `Reading ${filePath}…` });
        } catch {
          send({ type: "status", text: `Creating new file: ${filePath}` });
        }
      } else {
        const secs = Math.round(durationInFrames / 30);
        send({ type: "status", text: `Creating new ${secs}s composition…` });
      }

      // 2. Ensure audio placeholder exists if needed
      const audioFile = needsAudio(userMessage) ? pickAudioFile(userMessage) : null;
      if (audioFile) {
        send({ type: "status", text: `Using ${audioFile} for background music` });
      }

      // 3. Build prompt and stream to Gemma
      const prompt = buildPrompt(userMessage, filePath, fileContent, durationInFrames, audioFile);
      const tokenCount = Math.round(prompt.length / 4);
      send({ type: "status", text: `Gemma is writing the code… (${tokenCount} ctx tokens, may take 30–90s)` });

      let response = "";
      try {
        response = await streamOllama(prompt, (tok) => send({ type: "token", tok }));
      } catch (e) {
        send({ type: "error", content: `Ollama error: ${e}` });
        ctrl.close();
        return;
      }

      // 4. Extract code block
      const code = extractCode(response);
      if (!code) {
        send({ type: "error", content: "Gemma didn't output a code block. Try rephrasing your request." });
        ctrl.close();
        return;
      }

      // 5. Determine output path
      let outPath = filePath;
      if (!outPath) {
        const fileHint = response.match(/FILE:\s*(remotion\/[^\s\n]+)/);
        outPath = fileHint ? fileHint[1] : "remotion/compositions/NewVideo.tsx";
      }

      // 5b. Quick sanity check — catch the most common Gemma mistakes before writing
      const badPatterns = [
        /^\s*const\s+\{[^}]+\}\s*=\s*useVideoConfig\(\)/m,  // hook at module level
        /motion\.[a-z]+/,                                     // framer-motion usage
        /fontSize:\s*\d+rem/,                                 // invalid CSS unit in style obj
        /<Sequence[^>]+duration=\{/,                          // wrong prop name (durationInFrames)
      ];
      const badMatch = badPatterns.find(p => p.test(code));
      if (badMatch) {
        send({ type: "error", content: `Gemma produced invalid Remotion code (pattern: ${badMatch}). Try rephrasing or ask again.` });
        ctrl.close();
        return;
      }

      // 6. Write the file
      const fullOut = path.join(PROJECT_DIR, outPath);
      // Back up the original if it exists, so we can restore on validation failure
      const backup = fs.existsSync(fullOut) ? fs.readFileSync(fullOut, "utf-8") : null;
      fs.mkdirSync(path.dirname(fullOut), { recursive: true });
      fs.writeFileSync(fullOut, code, "utf-8");
      send({ type: "file_written", path: outPath });

      // 7. Register in Root.tsx if new composition
      if (!filePath && outPath !== "remotion/Root.tsx") {
        const compName = path.basename(outPath, ".tsx");
        const rootPath = path.join(PROJECT_DIR, "remotion/Root.tsx");
        const root = fs.readFileSync(rootPath, "utf-8");
        if (!root.includes(compName)) {
          const newRoot = root
            .replace(
              /import { AIVideo } from/,
              `import { ${compName} } from "./compositions/${compName}";\nimport { AIVideo } from`
            )
            .replace(
              /    <\/>\n  \);\n\};/,
              `      <Composition id="${compName}" component={${compName}} durationInFrames={${durationInFrames}} fps={30} width={1080} height={1920} defaultProps={{}} />\n    </>\n  );\n};`
            );
          fs.writeFileSync(rootPath, newRoot);
          send({ type: "file_written", path: "remotion/Root.tsx" });
        }
      }

      // 8. Validate
      send({ type: "status", text: "Validating with Remotion…" });
      const compId = outPath.includes("SocialReel") ? "SocialReel-tiktok"
        : outPath.includes("LogoReveal") ? "LogoReveal"
        : outPath.includes("AIVideo") ? "AIVideo"
        : path.basename(outPath, ".tsx");

      const validation = runCmd(`remotion still remotion/index.ts ${compId} --frame=30 --scale=0.25 --output=out/preview-${compId}.png`);
      const success = !validation.toLowerCase().includes("error") && !validation.toLowerCase().includes("failed");

      // Auto-restore backup if validation failed and we had a working original
      if (!success && backup) {
        fs.writeFileSync(fullOut, backup, "utf-8");
        send({ type: "status", text: "Restored original file — Gemma's code had errors" });
      }

      send({ type: "validation", success, output: validation.slice(-400), compId });
      send({ type: "done" });
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
