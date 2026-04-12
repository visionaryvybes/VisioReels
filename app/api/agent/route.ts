import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PROJECT_DIR = process.cwd();
const OLLAMA_URL  = "http://localhost:11434/api/chat";
const MODEL       = "gemma4:e4b";

// ── System prompt (remotion-dev/skills) ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a Remotion video-creation agent. You help build programmatic videos using React and Remotion by reading and editing TypeScript files and running shell commands.

Project directory: ${PROJECT_DIR}

## Workflow
1. Read files before editing them.
2. Write/update TSX files in remotion/ directory.
3. After every change validate: run_command → remotion still remotion/index.ts <id> --frame=30 --scale=0.25
4. Render: run_command → remotion render remotion/index.ts <id> out/<name>.mp4

## Animation Rules (CRITICAL)
- ALL animations MUST use useCurrentFrame() — no exceptions.
- Import: import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion"
- Durations: const { fps } = useVideoConfig(); const DUR = 2 * fps;
- interpolate with clamping: interpolate(frame, [0, DUR], [0, 1], { extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })
- Easing: Crisp=Easing.bezier(0.16,1,0.3,1) Editorial=Easing.bezier(0.45,0,0.55,1) Overshoot=Easing.bezier(0.34,1.56,0.64,1)
- Springs: spring({ frame, fps, config: { damping: 12, stiffness: 180 } })
- FORBIDDEN: CSS transitions, CSS animations, Tailwind animation classes.

## Compositions (remotion/Root.tsx)
<Composition id="MyVideo" component={C} durationInFrames={150} fps={30} width={1080} height={1920} defaultProps={{}} />

## Sequencing
- <Sequence from={N} durationInFrames={M} premountFor={20}> — always premountFor
- useCurrentFrame() inside Sequence = relative frames from 0
- <Series> for back-to-back scenes

## Timing
const p = interpolate(frame,[0,fps*1.5],[0,1],{extrapolateRight:"clamp"});
const opacity=p; const y=interpolate(p,[0,1],[40,0]); const scale=interpolate(p,[0,1],[0.9,1]);

## Fonts
import { loadFont } from "@remotion/google-fonts/Inter"; const { fontFamily } = loadFont();

## Layout
<AbsoluteFill> as outermost wrapper always.

## Existing Compositions
SocialReel-tiktok 1080×1920 30fps 450f | SocialReel-reels 1080×1920 | SocialReel-shorts 1080×1920 | SocialReel-pinterest 1000×1500 300f | SocialReel-x 1280×720 270f

## Tool Format — use EXACTLY this, one tool per response:
<tool>read_file</tool><path>remotion/Root.tsx</path>
<tool>write_file</tool><path>remotion/compositions/MyScene.tsx</path><content>// code</content>
<tool>run_command</tool><cmd>npm run still -- --composition=SocialReel-tiktok --frame=30 --scale=0.25</cmd>
<tool>list_files</tool><path>remotion/</path>

After each tool, wait for the result. When done, summarize what was built.`;

// ── Tools ─────────────────────────────────────────────────────────────────────

function readFile(p: string) {
  const full = path.isAbsolute(p) ? p : path.join(PROJECT_DIR, p);
  try { return fs.readFileSync(full, "utf-8"); }
  catch { return `ERROR: not found: ${full}`; }
}

function writeFile(p: string, content: string) {
  const full = path.isAbsolute(p) ? p : path.join(PROJECT_DIR, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return `✓ Written: ${full}`;
}

function runCmd(cmd: string) {
  const BIN = path.join(PROJECT_DIR, "node_modules/.bin");
  const finalCmd = cmd.replace(/^remotion\b/, `${BIN}/remotion`);
  try {
    const out = execSync(finalCmd, {
      cwd: PROJECT_DIR,
      timeout: 300_000,
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` },
    });
    return (out || "").slice(0, 2000);
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
      options: { temperature: 0.3, top_p: 0.9, num_ctx: 8192 },
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
        const obj = JSON.parse(line);
        const tok = obj?.message?.content ?? "";
        if (tok) { full += tok; onToken(tok); }
      } catch {}
    }
  }
  return full;
}

// ── SSE helper ────────────────────────────────────────────────────────────────

type SSEEvent = Record<string, unknown>;

export async function POST(req: NextRequest) {
  const { messages: history, userMessage } = await req.json();

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (ev: SSEEvent) =>
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

      const msgs: Array<{ role: string; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userMessage },
      ];

      let iter = 0;
      while (iter < 8) {
        iter++;
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
          send({ type: "message", content: clean });
          msgs.push({ role: "assistant", content: response });
          break;
        }

        const reasoning = response.replace(/<tool>[\s\S]*/, "").trim();
        if (reasoning) send({ type: "reasoning", content: reasoning });

        const results: string[] = [];
        for (const call of toolCalls) {
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
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
