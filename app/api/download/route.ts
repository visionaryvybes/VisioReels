import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECT_DIR = process.cwd();

export async function GET(req: NextRequest) {
  const relPath = req.nextUrl.searchParams.get("path");
  if (relPath) {
    if (!/^html-renders\/[A-Za-z0-9._-]+\/final\.mp4$/.test(relPath)) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }
    const filePath = path.join(PROJECT_DIR, "public", relPath);
    const publicDir = path.join(PROJECT_DIR, "public");
    if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
      return NextResponse.json({ error: "file not rendered yet" }, { status: 404 });
    }
    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="html-video.mp4"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ error: "path param required" }, { status: 400 });
}
