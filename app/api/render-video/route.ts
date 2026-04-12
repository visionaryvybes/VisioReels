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
  // List available compositions: static ids from Root.tsx + dynamic SocialReel-<platform> ids
  const rootPath = path.join(PROJECT_DIR, "remotion", "Root.tsx");
  try {
    const content = fs.readFileSync(rootPath, "utf-8");
    // Static string ids: id="Foo" or id='Foo'
    const staticIds = [...content.matchAll(/id=["']([^"']+)["']/g)].map((m) => m[1]);
    // Dynamic SocialReel ids: extract only from PLATFORMS array in platforms.ts
    const platformsPath = path.join(PROJECT_DIR, "lib", "platforms.ts");
    let socialIds: string[] = [];
    try {
      const platformsContent = fs.readFileSync(platformsPath, "utf-8");
      // Grab only the PLATFORMS array block (stops at MOODS)
      const platformsBlock = platformsContent.match(/export const PLATFORMS[^=]+=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
      const platformIds = [...platformsBlock.matchAll(/id:\s*["']([^"']+)["']/g)].map((m) => m[1]);
      if (content.includes("SocialReel-") && platformIds.length) {
        socialIds = platformIds.map((id) => `SocialReel-${id}`);
      }
    } catch { /* platforms.ts not found — skip */ }
    const all = [...new Set([...socialIds, ...staticIds])];
    return NextResponse.json({ compositions: all });
  } catch {
    return NextResponse.json({ compositions: [] });
  }
}
