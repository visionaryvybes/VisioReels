import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECT_DIR = process.cwd();
const OUT_DIR = path.join(PROJECT_DIR, "out");

export async function GET(req: NextRequest) {
  const comp = req.nextUrl.searchParams.get("comp");
  if (!comp) {
    return NextResponse.json({ error: "comp param required" }, { status: 400 });
  }

  // Guard against path traversal — only allow alphanumeric, dash, underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(comp)) {
    return NextResponse.json({ error: "invalid composition id" }, { status: 400 });
  }

  const filePath = path.join(OUT_DIR, `${comp}.mp4`);
  if (!filePath.startsWith(OUT_DIR)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "file not rendered yet" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${comp}.mp4"`,
      "Cache-Control": "no-store",
    },
  });
}
