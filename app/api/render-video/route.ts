import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const PROJECT_DIR = process.cwd();
const BIN = path.join(PROJECT_DIR, "node_modules/.bin");

export async function POST(req: NextRequest) {
  const { composition } = await req.json();
  if (!composition) return NextResponse.json({ error: "composition required" }, { status: 400 });

  const outDir = path.join(PROJECT_DIR, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${composition}.mp4`);
  const cmd = `${BIN}/remotion render remotion/index.ts ${composition} ${outFile}`;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (d: object) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
      send({ type: "start", composition, cmd });
      try {
        const out = execSync(cmd, {
          cwd: PROJECT_DIR,
          timeout: 300_000,
          encoding: "utf-8",
          stdio: "pipe",
          env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` },
        });
        send({ type: "done", output: out.slice(-500), file: `out/${composition}.mp4` });
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string };
        const msg = (err.stdout ?? "") + (err.stderr ?? "") || err.message || "unknown error";
        send({ type: "error", output: msg.slice(-800) });
      }
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

export async function GET() {
  // List available compositions by reading Root.tsx
  const rootPath = path.join(PROJECT_DIR, "remotion", "Root.tsx");
  try {
    const content = fs.readFileSync(rootPath, "utf-8");
    const ids = [...content.matchAll(/id=["']([^"']+)["']/g)].map((m) => m[1]);
    return NextResponse.json({ compositions: ids });
  } catch {
    return NextResponse.json({ compositions: [] });
  }
}
