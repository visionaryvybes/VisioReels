import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { renderHtmlSlidesToPng } from "@/lib/html-slide-render";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const slides = body.slides;
  if (!Array.isArray(slides) || slides.some((s) => typeof s !== "string")) {
    return NextResponse.json(
      { error: "Body must include slides: string[]" },
      { status: 400 }
    );
  }
  if (slides.length === 0) {
    return NextResponse.json({ error: "slides must not be empty" }, { status: 400 });
  }
  if (slides.length > 48) {
    return NextResponse.json({ error: "Too many slides (max 48)" }, { status: 400 });
  }

  const width = Math.min(4096, Math.max(320, Number(body.width) || 1080));
  const height = Math.min(4096, Math.max(320, Number(body.height) || 1920));

  const publicDir = path.join(process.cwd(), "public");

  try {
    const result = await renderHtmlSlidesToPng({
      slides: slides as string[],
      width,
      height,
      publicDir,
    });

    return NextResponse.json({
      jobId: result.jobId,
      paths: result.paths,
      compositionId: "HtmlSlideVideo",
      inputProps: {
        slidePaths: result.paths,
        width,
        height,
        sceneLengthInFrames: 90,
        transitionLengthInFrames: 12,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
