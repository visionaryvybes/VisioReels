import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PROJECT_DIR = process.cwd();
const BIN         = path.join(PROJECT_DIR, "node_modules/.bin");
const OLLAMA_URL  = "http://localhost:11434/api/chat";
const MODEL       = "gemma4:e4b";

// ── System prompt ─────────────────────────────────────────────────────────────
// Minimal and directive. Gemma 4B must not ramble.

const SYSTEM_PROMPT = `You are a Remotion code-writing agent. Your ONLY job is to write and edit TypeScript/TSX files.

STRICT RULES:
- NEVER write reviews, analysis, or explanations. ONLY write code.
- Read a file at most ONCE. Then immediately write the updated version.
- After writing a file, call run_command to validate. Then STOP.
- If asked to add a feature: read the file → rewrite it → validate → done.
- Do NOT list files unless you have no idea what exists.

PROJECT: ${PROJECT_DIR}
REMOTION ENTRY: remotion/index.ts
COMPOSITIONS: remotion/Root.tsx + remotion/compositions/

ANIMATION RULES (mandatory):
- All animations: useCurrentFrame() + interpolate() or spring()
- Import: import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing, AbsoluteFill, Sequence } from "remotion"
- Durations: const { fps } = useVideoConfig(); const DUR = N * fps;
- Clamp all interpolations: { extrapolateRight: "clamp" }
- NEVER use CSS transitions or CSS animations — they break rendering
- Springs: spring({ frame, fps, config: { damping: 14, stiffness: 160 } })
- Easing: Easing.bezier(0.16, 1, 0.3, 1) for entrances

WORD-BY-WORD CAPTIONS pattern:
\`\`\`tsx
const words = captions; // string[]
{words.map((word, i) => {
  const start = i * wordInterval;
  const wordSpring = spring({ frame: Math.max(0, frame - start), fps, config: { damping: 20, stiffness: 200 } });
  const wordY = interpolate(wordSpring, [0, 1], [20, 0]);
  const wordOpacity = interpolate(wordSpring, [0, 1], [0, 1]);
  return (
    <span key={i} style={{ display: 'inline-block', transform: \`translateY(\${wordY}px)\`, opacity: wordOpacity, marginRight: 8 }}>
      {word}
    </span>
  );
})}
\`\`\`

VALIDATE: run_command → remotion still remotion/index.ts <CompositionId> --frame=30 --scale=0.25
RENDER:   run_command → remotion render remotion/index.ts <CompositionId> out/<name>.mp4

TOOL FORMAT — use exactly this XML, one tool per message:
<tool>read_file</tool><path>remotion/compositions/SocialReel.tsx</path>
<tool>write_file</tool><path>remotion/compositions/SocialReel.tsx</path><content>
FULL FILE CONTENT HERE
</content>
<tool>run_command</tool><cmd>remotion still remotion/index.ts SocialReel-tiktok --frame=30 --scale=0.25</cmd>
<tool>list_files</tool><path>remotion/</path>`.trim();

// ── Tools ─────────────────────────────────────────────────────────────────────

function readFile(p: string) {
  const full = path.isAbsolute(p) ? p : path.join(PROJECT_DIR, p);
  try { return fs.readFileSync(full, "utf-8"); } catch { return `ERROR: not found: ${full}`; }
}

function writeFile(p: string, content: string) {
  const full = path.isAbsolute(p) ? p : path.join(PROJECT_DIR, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return `✓ Written: ${full}`;
}

function runCmd(cmd: string) {
  const resolved = cmd.replace(/^remotion\b/, `${BIN}/remotion`);
  try {
    return execSync(resolved, {
      cwd: PROJECT_DIR, timeout: 300_000, encoding: "utf-8", stdio: "pipe",
      env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` },
    }).slice(0, 2000);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return ((err.stdout ?? "") + (err.stderr ?? "") || err.message || "failed").slice(0, 2000);
  }
}

function listFiles(dir: string) {
  const full = path.isAbsolute(dir) ? dir : path.join(PROJECT_DIR, dir);
  const skip = new Set(["node_modules", ".git", ".next", "out"]);
  const lines: string[] = [];
  function walk(d: string, depth: number) {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      lines.push("  ".repeat(depth) + (e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`));
      if (e.isDirectory()) walk(path.join(d, e.name), depth + 1);
    }
  }
  walk(full, 0);
  return lines.join("\n");
}

function executeTool(tool: string, attrs: Record<string, string>) {
  switch (tool) {
    case "read_file":   return readFile(attrs.path ?? "");
    case "write_file":  return writeFile(attrs.path ?? "", attrs.content ?? "");
    case "run_command": return runCmd(attrs.cmd ?? "");
    case "list_files":  return listFiles(attrs.path ?? ".");
    default:            return `Unknown tool: ${tool}`;
  }
}

function parseTools(text: string) {
  const calls: Array<{ tool: string; attrs: Record<string, string> }> = [];
  const re = /<tool>(.*?)<\/tool>([\s\S]*?)(?=<tool>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tool = m[1].trim();
    const body = m[2];
    const attrs: Record<string, string> = {};
    for (const tag of ["path", "cmd", "content"]) {
      const tm = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(body);
      if (tm) attrs[tag] = tm[1].trim();
    }
    calls.push({ tool, attrs });
  }
  return calls;
}

// ── Streaming Ollama ──────────────────────────────────────────────────────────

async function streamOllama(
  messages: Array<{ role: string; content: string }>,
  onToken: (t: string) => void
): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, messages, stream: true,
      options: { temperature: 0.1, top_p: 0.9, num_ctx: 6000 },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}`);
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
  const { messages: history, userMessage } = await req.json();

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (ev: Record<string, unknown>) =>
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

      const msgs: Array<{ role: string; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userMessage },
      ];

      let reads = 0;
      for (let iter = 0; iter < 6; iter++) {
        send({ type: "thinking" });

        let response = "";
        try {
          response = await streamOllama(msgs, (tok) => send({ type: "token", tok }));
        } catch (e) {
          send({ type: "error", content: String(e) });
          break;
        }

        const toolCalls = parseTools(response);
        if (!toolCalls.length) {
          const clean = response.replace(/<tool>[\s\S]*?<\/tool>[\s\S]*?(?=<tool>|$)/g, "").trim();
          send({ type: "message", content: clean || "Done." });
          msgs.push({ role: "assistant", content: response });
          break;
        }

        const reasoning = response.replace(/<tool>[\s\S]*/, "").trim();
        if (reasoning) send({ type: "reasoning", content: reasoning });

        const results: string[] = [];
        for (const call of toolCalls) {
          // Limit reads to prevent infinite exploration
          if (call.tool === "read_file") reads++;
          if (reads > 3) {
            send({ type: "error", content: "Too many file reads — writing code now." });
            break;
          }
          send({ type: "tool_call", tool: call.tool, detail: call.attrs.path ?? call.attrs.cmd ?? "" });
          const result = executeTool(call.tool, call.attrs);
          send({ type: "tool_result", tool: call.tool, result: result.slice(0, 600) });
          results.push(`<result tool='${call.tool}'>\n${result}\n</result>`);
        }

        msgs.push({ role: "assistant", content: response });
        msgs.push({ role: "user", content: results.join("\n") });
      }

      send({ type: "done" });
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
