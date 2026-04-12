import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PROJECT_DIR = process.cwd();
const BIN = path.join(PROJECT_DIR, "node_modules/.bin");
const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "gemma4-coder"; // 32K context, temp 0.2

// ── File resolver: pick the right file based on user request ─────────────────

function resolveFile(request: string): string | null {
  const r = request.toLowerCase();
  if (r.includes("logreveal") || r.includes("logo")) return "remotion/compositions/LogoReveal.tsx";
  if (r.includes("aivideo") || r.includes("ai video") || r.includes("ai and coding")) return "remotion/compositions/AIVideo.tsx";
  if (r.includes("socialreel") || r.includes("tiktok") || r.includes("reels") || r.includes("caption") || r.includes("hook")) return "remotion/compositions/SocialReel.tsx";
  if (r.includes("root") || r.includes("composition") || r.includes("register") || r.includes("new video") || r.includes("create a")) return "remotion/Root.tsx";
  return null;
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

// ── Code extractor: pull tsx/ts/js block from Gemma response ─────────────────

function extractCode(response: string): string | null {
  const match = response.match(/```(?:tsx?|jsx?|typescript|javascript)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

// ── Build the prompt Gemma receives ──────────────────────────────────────────

function buildPrompt(userRequest: string, filePath: string | null, fileContent: string | null): string {
  const remotionRules = `
REMOTION RULES (mandatory):
- All animations: useCurrentFrame() + interpolate() or spring() — NEVER CSS transitions
- Import from "remotion": useCurrentFrame, useVideoConfig, interpolate, spring, Easing, AbsoluteFill, Sequence
- Durations: const { fps } = useVideoConfig(); const DUR = N * fps
- Clamp: { extrapolateRight: "clamp" }
- Word-by-word: stagger with index * N frames delay, each word gets its own spring
- Entry easing: Easing.bezier(0.16, 1, 0.3, 1)
- Always wrap in <AbsoluteFill>`.trim();

  if (filePath && fileContent) {
    return `You are a Remotion video coding expert. The user wants to modify a file.

${remotionRules}

CURRENT FILE: ${filePath}
\`\`\`tsx
${fileContent}
\`\`\`

USER REQUEST: ${userRequest}

Output the COMPLETE modified file inside a single \`\`\`tsx code block. No explanations. No partial code. The full file only.`;
  }

  return `You are a Remotion video coding expert. Create a new Remotion composition.

${remotionRules}

USER REQUEST: ${userRequest}

Project structure:
${listRemotionFiles()}

Output a NEW complete TSX file inside a \`\`\`tsx code block.
Then on a new line write: FILE: remotion/compositions/YourComponentName.tsx
No explanations.`;
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
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split("\n")) {
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

      // 1. Figure out which file to edit
      const filePath = resolveFile(userMessage);
      let fileContent: string | null = null;

      if (filePath) {
        const full = path.join(PROJECT_DIR, filePath);
        try {
          fileContent = fs.readFileSync(full, "utf-8");
          send({ type: "status", text: `Reading ${filePath}…` });
        } catch {
          send({ type: "status", text: `Creating new file: ${filePath}` });
        }
      } else {
        send({ type: "status", text: "Creating new composition…" });
      }

      // 2. Build prompt and send to Gemma
      const prompt = buildPrompt(userMessage, filePath, fileContent);
      send({ type: "status", text: "Gemma is writing the code…" });

      let response = "";
      try {
        response = await streamOllama(prompt, (tok) => send({ type: "token", tok }));
      } catch (e) {
        send({ type: "error", content: `Ollama error: ${e}` });
        ctrl.close();
        return;
      }

      // 3. Extract the code block
      const code = extractCode(response);
      if (!code) {
        send({ type: "error", content: "Gemma didn't output a code block. Try rephrasing." });
        ctrl.close();
        return;
      }

      // 4. Determine output file path
      let outPath = filePath;
      if (!outPath) {
        // Try to parse FILE: hint from response
        const fileHint = response.match(/FILE:\s*(remotion\/[^\s\n]+)/);
        outPath = fileHint ? fileHint[1] : "remotion/compositions/NewVideo.tsx";
      }

      // 5. Write the file
      const fullOut = path.join(PROJECT_DIR, outPath);
      fs.mkdirSync(path.dirname(fullOut), { recursive: true });
      fs.writeFileSync(fullOut, code, "utf-8");
      send({ type: "file_written", path: outPath });

      // 6. If new composition, add to Root.tsx
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
              `      <Composition id="${compName}" component={${compName}} durationInFrames={300} fps={30} width={1080} height={1080} defaultProps={{}} />\n    </>\n  );\n};`
            );
          fs.writeFileSync(rootPath, newRoot);
          send({ type: "file_written", path: "remotion/Root.tsx" });
        }
      }

      // 7. Validate with remotion still
      send({ type: "status", text: "Validating with Remotion…" });
      const compId = outPath.includes("SocialReel") ? "SocialReel-tiktok"
        : outPath.includes("LogoReveal") ? "LogoReveal"
        : outPath.includes("AIVideo") ? "AIVideo"
        : path.basename(outPath, ".tsx");

      const validation = runCmd(`remotion still remotion/index.ts ${compId} --frame=30 --scale=0.25 --output=out/preview-${compId}.png`);
      const success = !validation.toLowerCase().includes("error") && !validation.toLowerCase().includes("failed");

      send({ type: "validation", success, output: validation.slice(-400), compId });
      send({ type: "done" });
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
