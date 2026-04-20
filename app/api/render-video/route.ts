import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const PROJECT_DIR = process.cwd();
const BIN = path.join(PROJECT_DIR, "node_modules/.bin");

export async function POST(req: NextRequest) {
  let composition: unknown;
  let inputProps: unknown;
  try {
    ({ composition, inputProps } = await req.json());
  } catch {
    return NextResponse.json(
      { error: "request body must be JSON with { composition, inputProps? }" },
      { status: 400 }
    );
  }
  if (typeof composition !== "string" || !composition.trim()) {
    return NextResponse.json({ error: "composition required" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(composition)) {
    return NextResponse.json({ error: "invalid composition id" }, { status: 400 });
  }
  if (inputProps !== undefined) {
    const invalidInputProps =
      inputProps === null ||
      Array.isArray(inputProps) ||
      typeof inputProps !== "object";
    if (invalidInputProps) {
      return NextResponse.json(
        { error: "inputProps must be a JSON object when provided" },
        { status: 400 }
      );
    }
  }

  const outDir = path.join(PROJECT_DIR, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${composition}.mp4`);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(ctrl) {
      const send = (d: object) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
      send({ type: "start", composition, hasInputProps: inputProps !== undefined });

      const renderArgs = [
        "render",
        "remotion/index.ts",
        composition,
        outFile,
        "--log=verbose",
      ];

      if (inputProps !== undefined) {
        renderArgs.push("--props", JSON.stringify(inputProps));
      }

      const child = spawn(
        `${BIN}/remotion`,
        renderArgs,
        {
          cwd: PROJECT_DIR,
          env: { ...process.env, PATH: `${BIN}:${process.env.PATH}`, FORCE_COLOR: "0" },
        }
      );

      let totalFrames = 0;
      let lastProgress = -1;

      const parseLine = (line: string) => {
        // Parse "Rendering frame X/Y"
        const frameMatch = line.match(/Rendering frame (\d+)\/(\d+)/i);
        if (frameMatch) {
          const current = parseInt(frameMatch[1]);
          const total = parseInt(frameMatch[2]);
          totalFrames = total;
          const progress = Math.round((current / total) * 100);
          if (progress !== lastProgress) {
            lastProgress = progress;
            send({ type: "progress", progress, frame: current, total });
          }
          return;
        }
        // Parse bundling progress "Bundling X%"
        const bundleMatch = line.match(/Bundling (\d+)%/i);
        if (bundleMatch) {
          const pct = parseInt(bundleMatch[1]);
          send({ type: "bundling", progress: pct });
          return;
        }
        // Parse encoded frames
        const encMatch = line.match(/Encoded (\d+)\/(\d+)/i);
        if (encMatch) {
          const current = parseInt(encMatch[1]);
          const total = parseInt(encMatch[2]) || totalFrames || 1;
          const progress = Math.round((current / total) * 100);
          if (progress !== lastProgress) {
            lastProgress = progress;
            send({ type: "encoding", progress, frame: current, total });
          }
        }
      };

      let stdoutBuf = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        lines.forEach(parseLine);
      });

      let stderrBuf = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split("\n");
        stderrBuf = lines.pop() ?? "";
        lines.forEach(parseLine);
      });

      child.on("close", (code) => {
        if (code === 0) {
          send({ type: "done", file: `out/${composition}.mp4`, progress: 100 });
        } else {
          const errOutput = (stderrBuf + stdoutBuf).slice(-800);
          send({ type: "error", output: errOutput || `Process exited with code ${code}` });
        }
        ctrl.close();
      });

      child.on("error", (err) => {
        send({ type: "error", output: err.message });
        ctrl.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET() {
  const rootPath = path.join(PROJECT_DIR, "remotion", "Root.tsx");
  try {
    const content = fs.readFileSync(rootPath, "utf-8");
    const compositions = [...new Set([...content.matchAll(/id=["']([^"']+)["']/g)].map((m) => m[1]))];
    return NextResponse.json({ compositions });
  } catch {
    return NextResponse.json({ compositions: [] });
  }
}
