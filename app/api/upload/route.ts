import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

const PROJECT_DIR = process.cwd();
const UPLOADS_DIR = path.join(PROJECT_DIR, "public", "uploads");
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "no files" }, { status: 400 });
    }

    const saved: { name: string; url: string; path: string; size: number }[] = [];
    for (const f of files) {
      if (!ALLOWED.has(f.type)) {
        return NextResponse.json({ error: `unsupported type: ${f.type}` }, { status: 400 });
      }
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ error: `${f.name} exceeds 10 MB` }, { status: 413 });
      }
      // Store bytes as uploaded — no recompression or resizing (vision uses a separate derivative in /api/agent).
      const buf = Buffer.from(await f.arrayBuffer());
      const ext = (path.extname(f.name) || ".jpg").toLowerCase().replace(/[^a-z0-9.]/g, "");
      const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
      const safeName = `${hash}${ext}`;
      const full = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(full, buf);
      saved.push({
        name: f.name,
        url: `/uploads/${safeName}`,
        path: `uploads/${safeName}`,
        size: f.size,
      });
    }

    return NextResponse.json({ files: saved });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "upload failed" },
      { status: 500 }
    );
  }
}
